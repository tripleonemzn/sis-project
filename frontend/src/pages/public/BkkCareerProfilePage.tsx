import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { humasService } from '../../services/humas.service';
import { uploadService } from '../../services/upload.service';
import { ProfileEducationEditor } from '../../components/profile/ProfileEducationEditor';
import {
  buildEducationHistoryState,
  createEmptyEducationHistory,
  resolveEducationSummaryFromHistories,
  sanitizeEducationHistories,
  type ProfileEducationDocument,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
} from '../../features/profileEducation/profileEducation';
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
  skills: string;
  experienceSummary: string;
  cvUrl: string;
  portfolioUrl: string;
  linkedinUrl: string;
};

type ProfileTabId = 'main' | 'education' | 'career';

const PROFILE_TABS: Array<{ id: ProfileTabId; label: string }> = [
  { id: 'main', label: 'Data Utama' },
  { id: 'education', label: 'Riwayat Pendidikan' },
  { id: 'career', label: 'Karier & Tautan' },
];

const emptyForm: ProfileFormState = {
  name: '',
  headline: '',
  phone: '',
  email: '',
  address: '',
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
  const [formDraft, setFormDraft] = useState<ProfileFormState | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabId>('main');
  const baselineEducationHistories = useMemo(
    () =>
      buildEducationHistoryState({
        track: 'NON_STUDENT',
        histories: (applicantProfile?.educationHistories || []) as ProfileEducationHistory[],
        legacyHighestEducation: applicantProfile?.educationLevel,
        legacyInstitutionName: applicantProfile?.schoolName,
        legacyStudyProgram: applicantProfile?.major,
      }),
    [
      applicantProfile?.educationHistories,
      applicantProfile?.educationLevel,
      applicantProfile?.major,
      applicantProfile?.schoolName,
    ],
  );
  const [educationHistoriesDraft, setEducationHistoriesDraft] = useState<ProfileEducationHistory[] | null>(null);
  const form = formDraft ?? buildForm(applicantProfile);
  const setForm = (updater: (prev: ProfileFormState) => ProfileFormState) => {
    setFormDraft((prev) => updater(prev ?? buildForm(applicantProfile)));
  };
  const educationHistories = educationHistoriesDraft ?? baselineEducationHistories;
  const setEducationHistories = (updater: (prev: ProfileEducationHistory[]) => ProfileEducationHistory[]) => {
    setEducationHistoriesDraft((prev) => updater(prev ?? baselineEducationHistories));
  };
  const educationSummary = useMemo(
    () => resolveEducationSummaryFromHistories(educationHistories, 'NON_STUDENT'),
    [educationHistories],
  );

  const saveMutation = useMutation({
    mutationFn: async () =>
      humasService.upsertMyApplicantProfile({
        name: form.name.trim(),
        headline: form.headline.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        educationHistories: sanitizeEducationHistories(educationHistories, 'NON_STUDENT'),
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

  const handleEducationHistorySave = (history: ProfileEducationHistory) => {
    setEducationHistories((prev) =>
      sanitizeEducationHistories(
        prev.map((entry) => (entry.level === history.level ? history : entry)),
        'NON_STUDENT',
      ),
    );
  };

  const handleEducationHistoryRemove = (level: ProfileEducationLevel) => {
    setEducationHistories((prev) =>
      sanitizeEducationHistories(
        prev.map((entry) => (entry.level === level ? createEmptyEducationHistory(level) : entry)),
        'NON_STUDENT',
      ),
    );
  };

  const handleEducationDocumentUpload = async (file: File): Promise<ProfileEducationDocument> => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/x-png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Dokumen riwayat pendidikan hanya boleh berformat PDF, JPG, JPEG, atau PNG.');
      throw new Error('Tipe file dokumen riwayat pendidikan tidak didukung');
    }
    if (file.size > 500 * 1024) {
      toast.error(`Ukuran file ${file.name} melebihi 500KB.`);
      throw new Error('Ukuran dokumen riwayat pendidikan melebihi batas');
    }
    try {
      const uploaded = await uploadService.uploadProfileEducationDocument(file);
      const document: ProfileEducationDocument = {
        kind: 'IJAZAH',
        label: file.name,
        fileUrl: uploaded.url,
        originalName: uploaded.originalname,
        mimeType: uploaded.mimetype,
        size: uploaded.size,
        uploadedAt: new Date().toISOString(),
      };
      toast.success(`${file.name} berhasil diunggah. Simpan riwayat pendidikan untuk merekam perubahan.`);
      return document;
    } catch (error: unknown) {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal mengunggah dokumen pendidikan');
      throw error;
    }
  };

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

      <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {PROFILE_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'border-orange-200 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        {activeTab === 'main' ? (
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
          </div>
        ) : null}

        {activeTab === 'education' ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
              <p className="text-sm font-semibold text-orange-900">Riwayat Pendidikan Pelamar</p>
              <p className="mt-1 text-sm leading-6 text-orange-800">
                Lengkapi riwayat pendidikan mulai SLTA/Sederajat hingga jenjang tertinggi yang Anda miliki.
                Saat ini sudah terisi {educationSummary.completedLevels} jenjang.
              </p>
            </div>
            <ProfileEducationEditor
              track="NON_STUDENT"
              histories={educationHistories}
              onSaveHistory={handleEducationHistorySave}
              onRemoveHistory={handleEducationHistoryRemove}
              onUploadDocument={handleEducationDocumentUpload}
            />
          </div>
        ) : null}

        {activeTab === 'career' ? (
          <div className="grid gap-5 xl:grid-cols-2">
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
        ) : null}

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
