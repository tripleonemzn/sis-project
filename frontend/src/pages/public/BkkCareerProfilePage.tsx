import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { humasService } from '../../services/humas.service';
import {
  ApplicantVerificationNotice,
  BKK_APPLICANT_PROFILE_QUERY_KEY,
  BKK_MY_APPLICATIONS_QUERY_KEY,
  InfoCard,
  VerificationBadge,
  extractApplicantProfilePayload,
} from './bkkShared';

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

function buildForm(profile: ReturnType<typeof extractApplicantProfilePayload>) {
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={5}
          placeholder={placeholder}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />
      )}
    </label>
  );
}

export const BkkCareerProfilePage = () => {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: BKK_APPLICANT_PROFILE_QUERY_KEY,
    queryFn: humasService.getMyApplicantProfile,
    staleTime: 60_000,
  });
  const applicantProfile = useMemo(() => extractApplicantProfilePayload(profileQuery.data), [profileQuery.data]);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);

  useEffect(() => {
    if (!applicantProfile) return;
    setForm(buildForm(applicantProfile));
  }, [applicantProfile]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      humasService.upsertMyApplicantProfile({
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
      toast.success('Profil pelamar berhasil disimpan');
      authService.clearMeCache();
      await queryClient.invalidateQueries({ queryKey: BKK_APPLICANT_PROFILE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: BKK_MY_APPLICATIONS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal menyimpan profil pelamar');
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">Profil Pelamar</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Lengkapi Profil Karier BKK</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Data di sini dipakai saat Anda melamar lowongan melalui aplikasi. Semakin lengkap profilnya, semakin mudah
          tim BKK menilai kecocokan lamaran Anda.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <InfoCard title="Status Profil">
          <p className="text-3xl font-semibold text-slate-900">
            {applicantProfile?.completeness.isReady ? 'Siap' : 'Belum'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {applicantProfile?.completeness.isReady
              ? 'Profil Anda siap dipakai untuk melamar.'
              : `Masih perlu dilengkapi: ${applicantProfile?.completeness.missingFields.join(', ') || 'data utama'}.`}
          </p>
        </InfoCard>
        <InfoCard title="Status Verifikasi">
          <VerificationBadge status={applicantProfile?.verificationStatus} />
        </InfoCard>
        <InfoCard title="Aksi Cepat">
          <div className="flex flex-wrap gap-3">
            <Link
              to="/public/vacancies"
              className="inline-flex items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Lihat Lowongan
            </Link>
            <Link
              to="/public/applications"
              className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Lamaran Saya
            </Link>
          </div>
        </InfoCard>
      </div>

      <ApplicantVerificationNotice status={applicantProfile?.verificationStatus} />

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-2">
          <Field label="Nama Pelamar" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
          <Field
            label="Headline / Posisi yang Diminati"
            value={form.headline}
            onChange={(value) => setForm((prev) => ({ ...prev, headline: value }))}
            placeholder="Contoh: Fresh graduate TKJ siap magang atau kerja entry-level"
          />
          <Field label="Nomor Telepon" value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
          <Field label="Email Aktif" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
          <Field
            label="Alamat Domisili"
            value={form.address}
            onChange={(value) => setForm((prev) => ({ ...prev, address: value }))}
            multiline
          />
          <Field
            label="Jenjang Pendidikan"
            value={form.educationLevel}
            onChange={(value) => setForm((prev) => ({ ...prev, educationLevel: value }))}
            placeholder="Contoh: SMK / SMA / D3"
          />
          <Field
            label="Tahun Lulus"
            value={form.graduationYear}
            onChange={(value) => setForm((prev) => ({ ...prev, graduationYear: value }))}
            placeholder="Contoh: 2025"
          />
          <Field
            label="Asal Sekolah / Kampus"
            value={form.schoolName}
            onChange={(value) => setForm((prev) => ({ ...prev, schoolName: value }))}
          />
          <Field label="Jurusan / Kompetensi" value={form.major} onChange={(value) => setForm((prev) => ({ ...prev, major: value }))} />
          <Field
            label="Skill / Keahlian"
            value={form.skills}
            onChange={(value) => setForm((prev) => ({ ...prev, skills: value }))}
            multiline
            placeholder="Tulis ringkas keahlian yang paling relevan."
          />
          <Field
            label="Pengalaman Singkat"
            value={form.experienceSummary}
            onChange={(value) => setForm((prev) => ({ ...prev, experienceSummary: value }))}
            multiline
            placeholder="PKL, proyek, organisasi, freelance, dan pengalaman relevan lainnya."
          />
          <Field label="URL CV" value={form.cvUrl} onChange={(value) => setForm((prev) => ({ ...prev, cvUrl: value }))} placeholder="https://..." />
          <Field
            label="URL Portofolio"
            value={form.portfolioUrl}
            onChange={(value) => setForm((prev) => ({ ...prev, portfolioUrl: value }))}
            placeholder="https://..."
          />
          <Field
            label="URL LinkedIn"
            value={form.linkedinUrl}
            onChange={(value) => setForm((prev) => ({ ...prev, linkedinUrl: value }))}
            placeholder="https://..."
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link
            to="/public/vacancies"
            className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Kembali ke Lowongan
          </Link>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Profil Pelamar'}
          </button>
        </div>
      </section>
    </div>
  );
};
