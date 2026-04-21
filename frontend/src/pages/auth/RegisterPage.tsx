import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, type RegisterOptions, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  GraduationCap,
  HeartHandshake,
  IdCard,
  KeyRound,
  Mail,
  Phone,
  School,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { majorService, type Major } from '../../services/major.service';
import { getNisnValidationMessage, normalizeNisnInput } from '../../utils/nisn';

type RegisterMode = 'candidate' | 'parent' | 'bkk';

const REGISTER_MODE_CONFIG: Record<
  RegisterMode,
  {
    title: string;
    subtitle: string;
    submitLabel: string;
    accentClass: string;
    buttonClass: string;
    iconClass: string;
    eyebrow: string;
    highlights: string[];
  }
> = {
  candidate: {
    title: 'Daftar Calon Siswa',
    subtitle: 'Buat akun PPDB, pilih jurusan tujuan sejak awal, lalu pantau proses pendaftaran dan tahap tes berikutnya.',
    submitLabel: 'Buat Akun Calon Siswa',
    accentClass: 'from-[#163f92] via-[#2a64b6] to-[#1b9b93]',
    buttonClass: 'bg-[#2d5daa] hover:bg-[#244f91]',
    iconClass: 'bg-sky-100 text-sky-700 ring-sky-200',
    eyebrow: 'PPDB Terpadu',
    highlights: [
      'Pilih jurusan tujuan dari data kompetensi keahlian yang aktif di sistem.',
      'Akun siap dipakai memantau tahapan PPDB dan tes seleksi.',
      'Pengumuman hasil dan surat seleksi tampil dari akun yang sama.',
    ],
  },
  parent: {
    title: 'Daftar Orang Tua',
    subtitle: 'Buat satu akun orang tua dengan mengaitkan anak pertama memakai NISN dan tanggal lahir.',
    submitLabel: 'Buat Akun Orang Tua',
    accentClass: 'from-[#0f5b63] via-[#177f7c] to-[#22a27a]',
    buttonClass: 'bg-[#1f7b76] hover:bg-[#186762]',
    iconClass: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    eyebrow: 'Akun Keluarga',
    highlights: [
      'Anak pertama diverifikasi dari awal memakai NISN dan tanggal lahir.',
      'Setelah akun aktif, anak berikutnya bisa ditambahkan dari akun yang sama.',
      'Approval admin menampilkan konteks anak, kelas, dan jurusan secara jelas.',
    ],
  },
  bkk: {
    title: 'Daftar BKK',
    subtitle: 'Buat akun pelamar untuk melihat lowongan BKK dan mengikuti proses rekrutmen.',
    submitLabel: 'Buat Akun Pelamar',
    accentClass: 'from-[#8a4f17] via-[#b86a30] to-[#bf4d64]',
    buttonClass: 'bg-[#a35d25] hover:bg-[#8c4f1e]',
    iconClass: 'bg-amber-100 text-amber-700 ring-amber-200',
    eyebrow: 'BKK Karier',
    highlights: [
      'Profil pelamar dan lamaran kerja dikelola dari akun yang sama.',
      'Lowongan BKK bisa dipantau tanpa bercampur dengan modul sekolah.',
      'Tahapan review dan hasil lamaran lebih mudah diikuti.',
    ],
  },
};

const REGISTER_HUB_OPTIONS: Array<{
  mode: RegisterMode;
  title: string;
  description: string;
  icon: ReactNode;
  accentClass: string;
  iconClass: string;
  tagline: string;
}> = [
  {
    mode: 'candidate',
    title: 'Calon Siswa',
    description: 'Untuk pendaftaran peserta didik baru, pengisian data PPDB, dan akses tahapan tes seleksi.',
    icon: <GraduationCap className="h-6 w-6" />,
    accentClass: 'from-sky-300/45 via-cyan-200/18 to-transparent',
    iconClass: 'bg-sky-100 text-sky-700 ring-sky-200',
    tagline: 'PPDB dengan jurusan tujuan',
  },
  {
    mode: 'parent',
    title: 'Orang Tua',
    description: 'Untuk satu akun keluarga yang dimulai dari NISN dan tanggal lahir anak pertama.',
    icon: <HeartHandshake className="h-6 w-6" />,
    accentClass: 'from-emerald-300/40 via-teal-200/18 to-transparent',
    iconClass: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    tagline: 'Akun keluarga berbasis data anak',
  },
  {
    mode: 'bkk',
    title: 'BKK / Pelamar',
    description: 'Untuk melihat lowongan BKK, melengkapi profil kerja, dan mengirim lamaran.',
    icon: <Briefcase className="h-6 w-6" />,
    accentClass: 'from-amber-300/46 via-orange-200/20 to-transparent',
    iconClass: 'bg-amber-100 text-amber-700 ring-amber-200',
    tagline: 'Akun pelamar dan lowongan kerja',
  },
];

const optionalEmailSchema = z
  .string()
  .email('Format email tidak valid')
  .or(z.literal(''));

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
    desiredMajorId: z
      .string()
      .min(1, 'Jurusan tujuan wajib dipilih')
      .transform((value) => Number(value))
      .pipe(z.number().int().positive('Jurusan tujuan wajib dipilih')),
    password: z.string().min(8, 'Password minimal 8 karakter'),
    confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

const parentSchema = z
  .object({
    name: z.string().min(1, 'Nama wajib diisi'),
    username: z.string().min(3, 'Username minimal 3 karakter'),
    phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
    email: optionalEmailSchema,
    childNisn: z
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
    childBirthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal lahir anak wajib memakai format YYYY-MM-DD'),
    password: z.string().min(8, 'Password minimal 8 karakter'),
    confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
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
    password: z.string().min(8, 'Password minimal 8 karakter'),
    confirmPassword: z.string().min(8, 'Konfirmasi password minimal 8 karakter'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

type CandidateFormInput = z.input<typeof candidateSchema>;
type CandidateFormValues = z.output<typeof candidateSchema>;
type ParentFormValues = z.infer<typeof parentSchema>;
type AccountFormValues = z.infer<typeof accountSchema>;

function resolveErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    return error.response?.data?.message ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error;
  return fallback;
}

function normalizeOptionalEmail(email: string) {
  const normalized = String(email || '').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function FormField({
  id,
  name,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  icon,
  error,
  register,
  registerOptions,
  inputMode,
  maxLength,
  helperText,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder: string;
  icon: ReactNode;
  error?: string;
  register: UseFormRegister<any>;
  registerOptions?: RegisterOptions;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  helperText?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="auth-field-shell relative rounded-xl">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          className="auth-field-input rounded-xl py-3 pl-10 pr-3"
          {...register(name, registerOptions)}
          name={name}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="mt-1 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  icon,
  error,
  disabled,
  helperText,
}: {
  id: string;
  name: string;
  label: string;
  value?: string | number;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  icon: ReactNode;
  error?: string;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="auth-field-shell relative rounded-xl">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <select
          id={id}
          name={name}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="auth-field-input rounded-xl py-3 pl-10 pr-3 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="mt-1 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}

function AuthCanvas({
  title,
  subtitle,
  children,
  accentClass,
  eyebrow = 'Registrasi Publik',
  highlights = [],
  showSupportStats = true,
  showSupportFooter = true,
  matchFormHeight = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  accentClass: string;
  eyebrow?: string;
  highlights?: string[];
  showSupportStats?: boolean;
  showSupportFooter?: boolean;
  matchFormHeight?: boolean;
}) {
  const leftPanelHeightClass = matchFormHeight ? 'lg:min-h-0' : 'lg:min-h-[640px]';
  const rightPanelHeightClass = matchFormHeight ? 'lg:min-h-0' : 'lg:min-h-[640px]';

  return (
    <div className="auth-font-ui relative min-h-screen overflow-hidden bg-[#112754]">
      <div className="absolute inset-0 bg-[#112754]" />
      <div
        className={`absolute inset-0 bg-gradient-to-br ${accentClass}`}
        style={{ opacity: 0.96 }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 16%, rgba(255,255,255,0.16) 0%, transparent 34%), radial-gradient(circle at 84% 14%, rgba(248,250,252,0.12) 0%, transparent 32%), radial-gradient(circle at 50% 88%, rgba(255,255,255,0.1) 0%, transparent 36%), linear-gradient(135deg, rgba(9,18,39,0.22) 0%, rgba(9,18,39,0.08) 45%, rgba(255,255,255,0.02) 100%)',
        }}
      />
      <div className="auth-grid-fade absolute inset-0 opacity-20" />
      <div className="auth-float-soft absolute -left-16 top-10 h-72 w-72 rounded-full bg-[rgba(165,243,252,0.18)] blur-3xl" />
      <div className="auth-float-soft-alt absolute right-[-6rem] top-[18%] h-80 w-80 rounded-full bg-[rgba(253,230,138,0.16)] blur-3xl" />
      <div className="auth-float-soft absolute bottom-[-8rem] left-[28%] h-96 w-96 rounded-full bg-white/8 blur-3xl [animation-delay:-5s]" />
      <div className="pointer-events-none absolute inset-0 select-none">
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute -left-10 top-[9%] hidden w-32 rotate-[-10deg] object-contain opacity-[0.07] lg:block"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute right-[4%] top-[8%] hidden w-52 rotate-[12deg] object-contain opacity-[0.055] xl:block"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute right-[8%] bottom-[7%] hidden w-28 rotate-[-8deg] object-contain opacity-[0.06] lg:block"
        />
      </div>
      <div className="absolute inset-0 bg-[rgba(255,255,255,0.04)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid w-full items-stretch gap-6 lg:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.18fr)] xl:gap-8">
          <div className="order-2 lg:order-1">
            <div className={`auth-panel-dark auth-reveal-up auth-reveal-up-delay-1 flex h-full min-h-[280px] flex-col justify-between rounded-[32px] p-6 sm:p-8 ${leftPanelHeightClass}`}>
              <div>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/65 px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.06)] transition hover:bg-white/85"
                >
                  <ArrowLeft size={16} />
                  Kembali ke Login
                </Link>
                <div className="mt-8">
                  <div className="flex items-center gap-4">
                    <img
                      src="/logo_sis_kgb2.png"
                      alt="Logo SMKS Karya Guna Bhakti 2"
                      className="h-16 w-16 object-contain drop-shadow-[0_18px_32px_rgba(15,23,42,0.18)]"
                    />
                    <div>
                      <p className="auth-kicker text-xs font-semibold uppercase text-slate-500">
                        {eyebrow}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">SMKS Karya Guna Bhakti 2</p>
                    </div>
                  </div>
                  <h1 className="auth-font-display mt-7 max-w-lg text-3xl font-semibold leading-tight text-slate-900 sm:text-[2rem]">
                    {title}
                  </h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-slate-700 sm:text-[15px]">{subtitle}</p>
                </div>

                <div className="mt-8 grid gap-3">
                  {highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="auth-option-card auth-frost-tile-muted rounded-2xl px-4 py-3 text-sm leading-6 text-slate-700"
                    >
                      {highlight}
                    </div>
                  ))}
                </div>

                {showSupportStats ? (
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {[
                      { value: '3', label: 'jalur' },
                      { value: '1', label: 'akun terarah' },
                      { value: 'cepat', label: 'mulai layanan' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="auth-frost-tile rounded-2xl px-4 py-3"
                      >
                        <p className="auth-font-display text-lg font-semibold text-slate-900">{item.value}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {showSupportFooter ? (
                <div className="auth-option-card auth-frost-tile rounded-[26px] p-5">
                  <p className="text-sm font-semibold text-slate-900">Alur registrasi dibuat per kebutuhan</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Setiap jalur memakai tampilan dan data yang lebih spesifik supaya pengguna tidak melihat form yang terlalu campur dan membingungkan.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className={`auth-panel-soft auth-reveal-up flex min-h-[320px] flex-col rounded-[32px] p-5 sm:p-7 ${rightPanelHeightClass} lg:p-10`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisterHub() {
  return (
    <AuthCanvas
      title="Pilih Jalur Pendaftaran"
      subtitle="Silakan pilih jenis akun yang paling sesuai agar proses registrasi langsung mengikuti kebutuhan Anda."
      accentClass="from-[#163f92] via-[#2a64b6] to-[#1b9b93]"
      eyebrow="Registrasi Publik"
      showSupportStats={false}
      showSupportFooter={false}
      highlights={[
        'Pilih jalur sesuai kebutuhan agar form yang muncul tetap ringkas dan relevan.',
        'Desain pendaftaran dipisah untuk calon siswa, orang tua, dan pelamar BKK.',
        'Setelah akun aktif, pengguna langsung diarahkan ke layanan yang tepat.',
      ]}
    >
      <div className="flex h-full flex-col space-y-6">
        <div>
          <p className="auth-kicker text-sm font-semibold uppercase text-[#1b6d99]">
            Langkah Awal
          </p>
          <h2 className="auth-font-display mt-2 text-2xl font-semibold text-slate-900 sm:text-[2rem]">
            Akun akan dibuat berdasarkan kebutuhan Anda
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Setelah memilih jalur pendaftaran, Anda akan diarahkan ke form yang sesuai tanpa mencampur kebutuhan calon siswa, orang tua, dan pelamar BKK.
          </p>
        </div>

        <div className="grid auto-rows-fr gap-4 lg:grid-cols-3">
          {REGISTER_HUB_OPTIONS.map((option, index) => (
            <Link
              key={option.mode}
              to={`/register/${option.mode}`}
              className="auth-option-card auth-reveal-up auth-frost-tile group relative flex h-full min-h-[292px] flex-col rounded-[30px] p-5 transition duration-200 hover:-translate-y-1 hover:border-white/90 hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)]"
              style={{ animationDelay: `${120 + index * 90}ms` }}
            >
              <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-br ${option.accentClass} opacity-100`} />
              <div className="relative flex h-full flex-col">
                <div className={`inline-flex w-fit rounded-2xl ring-1 ${option.iconClass} p-3 transition group-hover:scale-[1.03]`}>
                  {option.icon}
                </div>
                <p className="auth-kicker mt-5 text-xs font-semibold uppercase text-slate-500">
                  {option.tagline}
                </p>
                <h3 className="auth-font-display mt-3 min-h-[56px] text-xl font-semibold text-slate-900">{option.title}</h3>
                <p className="mt-3 min-h-[96px] text-sm leading-6 text-slate-600">{option.description}</p>
                <div className="mt-auto flex justify-center pt-6">
                  <span className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                    Lanjutkan pendaftaran
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AuthCanvas>
  );
}

function CandidateRegisterForm() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const majorsQuery = useQuery({
    queryKey: ['register-candidate-majors'],
    queryFn: async () => {
      const response = await majorService.list({ page: 1, limit: 100 });
      return (response?.data?.majors || []) as Major[];
    },
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CandidateFormInput, undefined, CandidateFormValues>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      name: '',
      nisn: '',
      desiredMajorId: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  const majorOptions = (majorsQuery.data || []).map((major) => ({
    value: String(major.id),
    label: `${major.code} - ${major.name}`,
  }));

  const onSubmit = async (values: CandidateFormValues) => {
    if (majorOptions.length === 0) {
      toast.error('Daftar jurusan belum tersedia. Coba lagi beberapa saat.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await authService.registerCalonSiswa({
        name: values.name.trim(),
        nisn: values.nisn.trim(),
        desiredMajorId: Number(values.desiredMajorId),
        phone: values.phone.trim(),
        email: normalizeOptionalEmail(values.email),
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success(response.message || 'Akun calon siswa berhasil dibuat');
      navigate('/login', { replace: true });
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Registrasi calon siswa gagal.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCanvas
      title={REGISTER_MODE_CONFIG.candidate.title}
      subtitle={REGISTER_MODE_CONFIG.candidate.subtitle}
      accentClass={REGISTER_MODE_CONFIG.candidate.accentClass}
      eyebrow={REGISTER_MODE_CONFIG.candidate.eyebrow}
      highlights={REGISTER_MODE_CONFIG.candidate.highlights}
      showSupportFooter={false}
      matchFormHeight
    >
      <div className="flex h-full flex-col space-y-6">
        <Link
          to="/register"
          className="auth-subtle-link inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          <ArrowLeft size={16} />
          Pilih jalur lain
        </Link>

        <div className="mb-1 flex flex-wrap gap-2 sm:hidden">
          {['PPDB', 'Akun Terarah', 'Tes Seleksi'].map((chip) => (
            <span
              key={chip}
              className="auth-utility-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
            >
              {chip}
            </span>
          ))}
        </div>

        <div className="auth-section-card auth-reveal-up auth-reveal-up-delay-1 rounded-[28px] p-5">
          <p className="auth-kicker text-xs font-semibold uppercase text-sky-700">
            Jalur Terpilih
          </p>
          <h2 className="auth-font-display mt-2 text-xl font-semibold text-slate-900">
            Form khusus calon siswa baru
          </h2>
          <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-3">
            {[
              'Akun dipakai untuk form PPDB dan tahap tes seleksi.',
              'Isi data dasar dulu, detail lain bisa dilengkapi setelah login.',
              'Hasil seleksi dan surat keputusan tampil dari akun ini.',
            ].map((item) => (
              <div key={item} className="auth-option-card auth-frost-tile h-full min-h-[128px] rounded-2xl px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>

        <form className="auth-reveal-up auth-reveal-up-delay-2 flex flex-1 flex-col justify-between gap-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            <FormField
              id="candidate-name"
              name="name"
              label="Nama Lengkap"
              autoComplete="name"
              placeholder="Masukkan nama lengkap"
              icon={<User size={18} />}
              error={errors.name?.message}
              register={register}
            />
            <FormField
              id="candidate-nisn"
              name="nisn"
              label="NISN"
              autoComplete="off"
              placeholder="10 digit NISN"
              icon={<IdCard size={18} />}
              error={errors.nisn?.message}
              register={register}
              inputMode="numeric"
              maxLength={10}
              registerOptions={{
                setValueAs: (value) => normalizeNisnInput(value),
                onChange: (event: { target?: { value: string } }) => {
                  if (event?.target) {
                    event.target.value = normalizeNisnInput(event.target.value);
                  }
                },
              }}
            />
            <Controller
              control={control}
              name="desiredMajorId"
              render={({ field: { onChange, value } }) => (
                <SelectField
                  id="candidate-major"
                  name="desiredMajorId"
                  label="Jurusan Tujuan"
                  value={value ?? ''}
                  onChange={onChange}
                  options={majorOptions}
                  placeholder={majorsQuery.isLoading ? 'Memuat daftar jurusan...' : 'Pilih jurusan tujuan'}
                  icon={<School size={18} />}
                  error={errors.desiredMajorId?.message}
                  disabled={majorsQuery.isLoading || majorOptions.length === 0}
                  helperText={
                    majorsQuery.isLoading
                      ? 'Daftar jurusan sedang dimuat dari sistem.'
                      : majorOptions.length === 0
                        ? 'Belum ada jurusan yang bisa dipilih saat ini.'
                        : 'Jurusan ini akan langsung tercatat di draft PPDB Anda.'
                  }
                />
              )}
            />
            <FormField
              id="candidate-phone"
              name="phone"
              label="Nomor HP"
              type="tel"
              autoComplete="tel"
              placeholder="Masukkan nomor HP"
              icon={<Phone size={18} />}
              error={errors.phone?.message}
              register={register}
            />
            <FormField
              id="candidate-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="Masukkan email aktif"
              icon={<Mail size={18} />}
              error={errors.email?.message}
              register={register}
            />
            <FormField
              id="candidate-password"
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              icon={<KeyRound size={18} />}
              error={errors.password?.message}
              register={register}
            />
            <FormField
              id="candidate-confirm-password"
              name="confirmPassword"
              label="Konfirmasi Password"
              type="password"
              autoComplete="new-password"
              placeholder="Ulangi password"
              icon={<KeyRound size={18} />}
              error={errors.confirmPassword?.message}
              register={register}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`auth-primary-button w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(20,58,136,0.22)] disabled:cursor-not-allowed disabled:opacity-70 ${REGISTER_MODE_CONFIG.candidate.buttonClass}`}
          >
            {isSubmitting ? 'Memproses...' : REGISTER_MODE_CONFIG.candidate.submitLabel}
          </button>
        </form>
      </div>
    </AuthCanvas>
  );
}

function ParentRegisterForm() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ParentFormValues>({
    resolver: zodResolver(parentSchema),
    defaultValues: {
      name: '',
      username: '',
      phone: '',
      email: '',
      childNisn: '',
      childBirthDate: '',
      password: '',
      confirmPassword: '',
    },
  });
  const config = REGISTER_MODE_CONFIG.parent;

  const onSubmit = async (values: ParentFormValues) => {
    try {
      setIsSubmitting(true);
      const response = await authService.registerParent({
        name: values.name.trim(),
        username: values.username.trim(),
        phone: values.phone.trim(),
        email: normalizeOptionalEmail(values.email),
        childNisn: values.childNisn.trim(),
        childBirthDate: values.childBirthDate,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success(response.message || 'Akun berhasil dibuat');
      navigate('/login', { replace: true });
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Registrasi orang tua gagal.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCanvas
      title={config.title}
      subtitle={config.subtitle}
      accentClass={config.accentClass}
      eyebrow={config.eyebrow}
      highlights={config.highlights}
      showSupportFooter={false}
      matchFormHeight
    >
      <div className="flex h-full flex-col space-y-6">
        <Link
          to="/register"
          className="auth-subtle-link inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          <ArrowLeft size={16} />
          Pilih jalur lain
        </Link>

        <div className="mb-1 flex flex-wrap gap-2 sm:hidden">
          {['Akun Keluarga', 'NISN Anak', 'Tanggal Lahir Anak'].map((chip) => (
            <span
              key={chip}
              className="auth-utility-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
            >
              {chip}
            </span>
          ))}
        </div>

        <div className="auth-section-card auth-reveal-up auth-reveal-up-delay-1 rounded-[28px] p-5">
          <p className="auth-kicker text-xs font-semibold uppercase text-slate-600">
            Jalur Terpilih
          </p>
          <h2 className="auth-font-display mt-2 text-xl font-semibold text-slate-900">
            Form akun orang tua / wali
          </h2>
          <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-3">
            {[
              'Anak pertama diverifikasi dari awal memakai NISN dan tanggal lahir.',
              'Setelah akun aktif, anak berikutnya bisa ditambahkan dari dashboard orang tua.',
              'Approval admin akan menampilkan konteks anak, kelas, dan jurusan.',
            ].map((item) => (
              <div key={item} className="auth-option-card auth-frost-tile h-full min-h-[128px] rounded-2xl px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>

        <form className="auth-reveal-up auth-reveal-up-delay-2 flex flex-1 flex-col justify-between gap-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            <FormField
              id="parent-name"
              name="name"
              label="Nama Lengkap"
              autoComplete="name"
              placeholder="Masukkan nama lengkap"
              icon={<User size={18} />}
              error={errors.name?.message}
              register={register}
            />
            <FormField
              id="parent-username"
              name="username"
              label="Username"
              autoComplete="username"
              placeholder="Masukkan username"
              icon={<IdCard size={18} />}
              error={errors.username?.message}
              register={register}
            />
            <FormField
              id="parent-phone"
              name="phone"
              label="Nomor HP"
              type="tel"
              autoComplete="tel"
              placeholder="Masukkan nomor HP"
              icon={<Phone size={18} />}
              error={errors.phone?.message}
              register={register}
            />
            <FormField
              id="parent-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="Masukkan email aktif"
              icon={<Mail size={18} />}
              error={errors.email?.message}
              register={register}
            />
            <FormField
              id="parent-child-nisn"
              name="childNisn"
              label="NISN Anak Pertama"
              autoComplete="off"
              placeholder="10 digit NISN anak"
              icon={<School size={18} />}
              error={errors.childNisn?.message}
              register={register}
              inputMode="numeric"
              maxLength={10}
              helperText="Gunakan NISN siswa yang sudah terdaftar di sistem sekolah."
              registerOptions={{
                setValueAs: (value) => normalizeNisnInput(value),
                onChange: (event: { target?: { value: string } }) => {
                  if (event?.target) {
                    event.target.value = normalizeNisnInput(event.target.value);
                  }
                },
              }}
            />
            <FormField
              id="parent-child-birth-date"
              name="childBirthDate"
              label="Tanggal Lahir Anak"
              type="date"
              autoComplete="bday"
              placeholder="YYYY-MM-DD"
              icon={<CalendarDays size={18} />}
              error={errors.childBirthDate?.message}
              register={register}
              helperText="Harus sama persis dengan tanggal lahir anak yang tersimpan di sistem."
            />
            <FormField
              id="parent-password"
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              icon={<KeyRound size={18} />}
              error={errors.password?.message}
              register={register}
            />
            <FormField
              id="parent-confirm-password"
              name="confirmPassword"
              label="Konfirmasi Password"
              type="password"
              autoComplete="new-password"
              placeholder="Ulangi password"
              icon={<KeyRound size={18} />}
              error={errors.confirmPassword?.message}
              register={register}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`auth-primary-button w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(15,23,42,0.16)] disabled:cursor-not-allowed disabled:opacity-70 ${config.buttonClass}`}
          >
            {isSubmitting ? 'Memproses...' : config.submitLabel}
          </button>
        </form>
      </div>
    </AuthCanvas>
  );
}

function BkkRegisterForm() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      username: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  const config = REGISTER_MODE_CONFIG.bkk;

  const onSubmit = async (values: AccountFormValues) => {
    try {
      setIsSubmitting(true);
      const response = await authService.registerBkk({
        name: values.name.trim(),
        username: values.username.trim(),
        phone: values.phone.trim(),
        email: normalizeOptionalEmail(values.email),
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success(response.message || 'Akun berhasil dibuat');
      navigate('/login', { replace: true });
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Registrasi pelamar BKK gagal.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCanvas
      title={config.title}
      subtitle={config.subtitle}
      accentClass={config.accentClass}
      eyebrow={config.eyebrow}
      highlights={config.highlights}
      showSupportFooter={false}
      matchFormHeight
    >
      <div className="flex h-full flex-col space-y-6">
        <Link
          to="/register"
          className="auth-subtle-link inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          <ArrowLeft size={16} />
          Pilih jalur lain
        </Link>

        <div className="mb-1 flex flex-wrap gap-2 sm:hidden">
          {['BKK', 'Lowongan', 'Lamaran Kerja'].map((chip) => (
            <span
              key={chip}
              className="auth-utility-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
            >
              {chip}
            </span>
          ))}
        </div>

        <div className="auth-section-card auth-reveal-up auth-reveal-up-delay-1 rounded-[28px] p-5">
          <p className="auth-kicker text-xs font-semibold uppercase text-slate-600">
            Jalur Terpilih
          </p>
          <h2 className="auth-font-display mt-2 text-xl font-semibold text-slate-900">
            Form akun pelamar BKK
          </h2>
          <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-3">
            {[
              'Akun ini dipakai untuk profil pelamar, lowongan, dan proses lamaran.',
              'Gunakan username yang mudah diingat untuk akses BKK berikutnya.',
              'Lowongan dan status rekrutmen dipantau dari akun yang sama.',
            ].map((item) => (
              <div key={item} className="auth-option-card auth-frost-tile h-full min-h-[128px] rounded-2xl px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>

        <form className="auth-reveal-up auth-reveal-up-delay-2 flex flex-1 flex-col justify-between gap-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            <FormField
              id="bkk-name"
              name="name"
              label="Nama Lengkap"
              autoComplete="name"
              placeholder="Masukkan nama lengkap"
              icon={<User size={18} />}
              error={errors.name?.message}
              register={register}
            />
            <FormField
              id="bkk-username"
              name="username"
              label="Username"
              autoComplete="username"
              placeholder="Masukkan username"
              icon={<IdCard size={18} />}
              error={errors.username?.message}
              register={register}
            />
            <FormField
              id="bkk-phone"
              name="phone"
              label="Nomor HP"
              type="tel"
              autoComplete="tel"
              placeholder="Masukkan nomor HP"
              icon={<Phone size={18} />}
              error={errors.phone?.message}
              register={register}
            />
            <FormField
              id="bkk-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="Masukkan email aktif"
              icon={<Mail size={18} />}
              error={errors.email?.message}
              register={register}
            />
            <FormField
              id="bkk-password"
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              icon={<KeyRound size={18} />}
              error={errors.password?.message}
              register={register}
            />
            <FormField
              id="bkk-confirm-password"
              name="confirmPassword"
              label="Konfirmasi Password"
              type="password"
              autoComplete="new-password"
              placeholder="Ulangi password"
              icon={<KeyRound size={18} />}
              error={errors.confirmPassword?.message}
              register={register}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`auth-primary-button w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(15,23,42,0.16)] disabled:cursor-not-allowed disabled:opacity-70 ${config.buttonClass}`}
          >
            {isSubmitting ? 'Memproses...' : config.submitLabel}
          </button>
        </form>
      </div>
    </AuthCanvas>
  );
}

export const RegisterPage = () => {
  const { type } = useParams<{ type?: string }>();

  if (!type) {
    return <RegisterHub />;
  }

  if (type === 'candidate') {
    return <CandidateRegisterForm />;
  }

  if (type === 'parent') {
    return <ParentRegisterForm />;
  }

  if (type === 'bkk') {
    return <BkkRegisterForm />;
  }

  return <RegisterHub />;
};
