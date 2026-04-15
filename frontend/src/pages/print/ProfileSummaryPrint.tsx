import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import PrintLayout from './PrintLayout';
import {
  StandardSchoolDocumentHeader,
  type StandardSchoolDocumentHeaderSnapshot,
} from './shared/StandardSchoolDocumentHeader';

type PrintUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  verificationStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  nip?: string | null;
  nis?: string | null;
  nisn?: string | null;
  gender?: string | null;
  citizenship?: string | null;
  maritalStatus?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  nik?: string | null;
  familyCardNumber?: string | null;
  nuptk?: string | null;
  highestEducation?: string | null;
  studyProgram?: string | null;
  religion?: string | null;
  motherName?: string | null;
  motherNik?: string | null;
  childNumber?: number | null;
  distanceToSchool?: string | null;
  familyStatus?: string | null;
  livingWith?: string | null;
  transportationMode?: string | null;
  travelTimeToSchool?: string | null;
  kipNumber?: string | null;
  pkhNumber?: string | null;
  kksNumber?: string | null;
  siblingsCount?: number | null;
  fatherName?: string | null;
  fatherNik?: string | null;
  fatherEducation?: string | null;
  fatherOccupation?: string | null;
  fatherIncome?: string | null;
  motherEducation?: string | null;
  motherOccupation?: string | null;
  motherIncome?: string | null;
  guardianName?: string | null;
  guardianEducation?: string | null;
  guardianOccupation?: string | null;
  guardianPhone?: string | null;
  rt?: string | null;
  rw?: string | null;
  dusun?: string | null;
  province?: string | null;
  cityRegency?: string | null;
  village?: string | null;
  subdistrict?: string | null;
  postalCode?: string | null;
  ptkType?: string | null;
  employeeStatus?: string | null;
  appointmentDecree?: string | null;
  appointmentDate?: string | null;
  assignmentDecree?: string | null;
  assignmentDate?: string | null;
  institution?: string | null;
  employeeActiveStatus?: string | null;
  salarySource?: string | null;
  additionalDuties?: string[] | null;
  managedMajors?: Array<{ id: number; name: string; code?: string | null }> | null;
  examinerMajor?: { id: number; name: string; code?: string | null } | null;
  studentClass?: { id: number; name: string; major?: { id: number; name: string; code?: string | null } | null } | null;
  children?: Array<{ id: number; name: string; username?: string | null; nisn?: string | null }> | null;
  educationHistories?: Array<{
    level: string;
    institutionName?: string | null;
    faculty?: string | null;
    studyProgram?: string | null;
    gpa?: string | null;
    degree?: string | null;
    nrg?: string | null;
    documents?: Array<{
      kind: string;
      label?: string | null;
      originalName?: string | null;
      fileUrl?: string | null;
    }>;
  }> | null;
  documents?: Array<{
    title: string;
    fileUrl: string;
    category?: string | null;
  }> | null;
};

type ProfilePrintSummaryResponse = {
  documentHeader: StandardSchoolDocumentHeaderSnapshot;
  generatedAt: string;
  user: PrintUser;
};

type SectionItem = {
  label: string;
  value: string;
};

type SummarySection = {
  id: string;
  title: string;
  description: string;
  items: SectionItem[];
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Guru',
  STUDENT: 'Siswa',
  PRINCIPAL: 'Kepala Sekolah',
  STAFF: 'Staff',
  PARENT: 'Orang Tua / Wali',
  CALON_SISWA: 'Calon Siswa',
  UMUM: 'Pelamar BKK',
  EXAMINER: 'Penguji Eksternal',
  EXTRACURRICULAR_TUTOR: 'Tutor / Pembina',
};

const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: 'Terverifikasi',
  PENDING: 'Menunggu Verifikasi',
  REJECTED: 'Perlu Review',
};

const DUTY_LABELS: Record<string, string> = {
  WAKASEK_KURIKULUM: 'Wakasek Kurikulum',
  SEKRETARIS_KURIKULUM: 'Sekretaris Kurikulum',
  WAKASEK_KESISWAAN: 'Wakasek Kesiswaan',
  SEKRETARIS_KESISWAAN: 'Sekretaris Kesiswaan',
  WAKASEK_SARPRAS: 'Wakasek Sarpras',
  WAKASEK_HUMAS: 'Wakasek Humas',
  KAPROG: 'Kakom',
  HEAD_PROGRAM: 'Kakom',
  KEPALA_LAB: 'Kepala Lab',
  HEAD_LAB: 'Kepala Lab',
  PEMBINA_OSIS: 'Pembina OSIS',
  PEMBINA_EKSKUL: 'Pembina Ekskul',
  KOORDINATOR_PKL: 'Koordinator PKL',
  KOORDINATOR_BKK: 'Koordinator BKK',
  BENDAHARA_SEKOLAH: 'Bendahara Sekolah',
  OPERATOR_DAPODIK: 'Operator Dapodik',
  TEKNISI_LAB: 'Teknisi Lab',
  PUSTAKAWAN: 'Pustakawan',
  BP_BK: 'BP/BK',
};

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : '';
}

function formatDate(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value: string) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function pushIfValue(items: SectionItem[], label: string, value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return;
  items.push({ label, value: normalized });
}

function formatRoleLabel(role?: string | null) {
  const normalized = normalizeText(role).toUpperCase();
  return ROLE_LABELS[normalized] || normalized || '-';
}

function formatVerificationLabel(status?: string | null) {
  const normalized = normalizeText(status).toUpperCase();
  return VERIFICATION_LABELS[normalized] || normalized || '-';
}

function formatDutyLabels(duties?: string[] | null) {
  if (!Array.isArray(duties) || duties.length === 0) return '';
  return duties
    .map((duty) => DUTY_LABELS[String(duty).trim().toUpperCase()] || String(duty).replace(/_/g, ' '))
    .filter(Boolean)
    .join(', ');
}

function formatManagedMajors(user: PrintUser) {
  const managedMajors = Array.isArray(user.managedMajors) ? user.managedMajors : [];
  if (managedMajors.length === 0) return '';
  return managedMajors.map((major) => normalizeText(major.code) || major.name).filter(Boolean).join(', ');
}

function resolveEducationLevelLabel(level?: string | null) {
  const normalized = normalizeText(level).toUpperCase();
  const map: Record<string, string> = {
    TK: 'TK',
    SD: 'SD',
    SMP_MTS: 'SMP/MTs',
    SLTA: 'SLTA/Sederajat',
    D3: 'D3',
    D4_S1: 'D4/S1',
    S2: 'S2',
    S3: 'S3',
    CERTIFICATION: 'Sertifikasi',
  };
  return map[normalized] || normalized || '-';
}

function resolveDocumentLabel(kind?: string | null) {
  const normalized = normalizeText(kind).toUpperCase();
  const map: Record<string, string> = {
    IJAZAH: 'Ijazah',
    SKHUN: 'SKHUN / Dokumen Sejenis',
    TRANSKRIP: 'Transkrip Nilai',
    SERTIFIKAT: 'Sertifikat',
  };
  return map[normalized] || normalized || '-';
}

function buildSummarySections(user: PrintUser): SummarySection[] {
  const accountItems: SectionItem[] = [];
  pushIfValue(accountItems, 'Nama Lengkap', user.name);
  pushIfValue(accountItems, 'Username', user.username);
  pushIfValue(accountItems, 'Role', formatRoleLabel(user.role));
  pushIfValue(accountItems, 'Status Verifikasi', formatVerificationLabel(user.verificationStatus));
  pushIfValue(accountItems, 'Email', user.email);
  pushIfValue(accountItems, 'No. Telepon', user.phone);

  const personalItems: SectionItem[] = [];
  pushIfValue(personalItems, 'Jenis Kelamin', user.gender === 'MALE' ? 'Laki-laki' : user.gender === 'FEMALE' ? 'Perempuan' : '');
  pushIfValue(personalItems, 'Tempat Lahir', user.birthPlace);
  pushIfValue(personalItems, 'Tanggal Lahir', formatDate(user.birthDate));
  pushIfValue(personalItems, 'Kewarganegaraan', user.citizenship);
  pushIfValue(personalItems, 'Agama', user.religion);
  pushIfValue(personalItems, 'Status Perkawinan', user.maritalStatus);
  pushIfValue(personalItems, 'NIK', user.nik);
  pushIfValue(personalItems, 'No. KK', user.familyCardNumber);
  pushIfValue(personalItems, 'Alamat', user.address);
  pushIfValue(personalItems, 'RT / RW', [normalizeText(user.rt), normalizeText(user.rw)].filter(Boolean).join(' / '));
  pushIfValue(personalItems, 'Dusun', user.dusun);
  pushIfValue(personalItems, 'Kelurahan / Desa', user.village);
  pushIfValue(personalItems, 'Kecamatan', user.subdistrict);
  pushIfValue(personalItems, 'Kabupaten / Kota', user.cityRegency);
  pushIfValue(personalItems, 'Provinsi', user.province);
  pushIfValue(personalItems, 'Kode Pos', user.postalCode);

  const employmentItems: SectionItem[] = [];
  pushIfValue(employmentItems, 'NIP', user.nip);
  pushIfValue(employmentItems, 'NUPTK', user.nuptk);
  pushIfValue(employmentItems, 'Jenis PTK', user.ptkType);
  pushIfValue(employmentItems, 'Status Kepegawaian', user.employeeStatus);
  pushIfValue(employmentItems, 'Status Aktif', user.employeeActiveStatus);
  pushIfValue(employmentItems, 'Sumber Gaji', user.salarySource);
  pushIfValue(employmentItems, 'Institusi', user.institution);
  pushIfValue(employmentItems, 'SK Pengangkatan', user.appointmentDecree);
  pushIfValue(employmentItems, 'TMT Pengangkatan', formatDate(user.appointmentDate));
  pushIfValue(employmentItems, 'SK Penugasan', user.assignmentDecree);
  pushIfValue(employmentItems, 'Tanggal Penugasan', formatDate(user.assignmentDate));
  pushIfValue(employmentItems, 'Tugas Tambahan', formatDutyLabels(user.additionalDuties));
  pushIfValue(employmentItems, 'Kakom / Major Kelolaan', formatManagedMajors(user));
  pushIfValue(
    employmentItems,
    'Major Penguji',
    normalizeText(user.examinerMajor?.code) || normalizeText(user.examinerMajor?.name),
  );

  const studentItems: SectionItem[] = [];
  pushIfValue(studentItems, 'NIS', user.nis);
  pushIfValue(studentItems, 'NISN', user.nisn);
  pushIfValue(studentItems, 'Kelas Aktif', normalizeText(user.studentClass?.name));
  pushIfValue(
    studentItems,
    'Kompetensi Keahlian',
    normalizeText(user.studentClass?.major?.code) || normalizeText(user.studentClass?.major?.name),
  );
  pushIfValue(studentItems, 'Anak ke-', user.childNumber);
  pushIfValue(studentItems, 'Jumlah Saudara', user.siblingsCount);
  pushIfValue(studentItems, 'Status Dalam Keluarga', user.familyStatus);
  pushIfValue(studentItems, 'Tinggal Bersama', user.livingWith);
  pushIfValue(studentItems, 'Jarak ke Sekolah', user.distanceToSchool);
  pushIfValue(studentItems, 'Moda Transportasi', user.transportationMode);
  pushIfValue(studentItems, 'Waktu Tempuh', user.travelTimeToSchool);
  pushIfValue(studentItems, 'No. KIP', user.kipNumber);
  pushIfValue(studentItems, 'No. PKH', user.pkhNumber);
  pushIfValue(studentItems, 'No. KKS', user.kksNumber);

  const familyItems: SectionItem[] = [];
  pushIfValue(familyItems, 'Nama Ayah', user.fatherName);
  pushIfValue(familyItems, 'NIK Ayah', user.fatherNik);
  pushIfValue(familyItems, 'Pendidikan Ayah', user.fatherEducation);
  pushIfValue(familyItems, 'Pekerjaan Ayah', user.fatherOccupation);
  pushIfValue(familyItems, 'Penghasilan Ayah', user.fatherIncome);
  pushIfValue(familyItems, 'Nama Ibu', user.motherName);
  pushIfValue(familyItems, 'NIK Ibu', user.motherNik);
  pushIfValue(familyItems, 'Pendidikan Ibu', user.motherEducation);
  pushIfValue(familyItems, 'Pekerjaan Ibu', user.motherOccupation);
  pushIfValue(familyItems, 'Penghasilan Ibu', user.motherIncome);
  pushIfValue(familyItems, 'Nama Wali', user.guardianName);
  pushIfValue(familyItems, 'Pendidikan Wali', user.guardianEducation);
  pushIfValue(familyItems, 'Pekerjaan Wali', user.guardianOccupation);
  pushIfValue(familyItems, 'No. Telepon Wali', user.guardianPhone);

  const parentItems: SectionItem[] = [];
  const childrenSummary = (user.children || [])
    .map((child) => {
      const parts = [normalizeText(child.name)];
      if (normalizeText(child.nisn)) parts.push(`NISN ${normalizeText(child.nisn)}`);
      return parts.join(' • ');
    })
    .filter(Boolean)
    .join('\n');
  pushIfValue(parentItems, 'Anak Tertaut', childrenSummary);

  const sections: SummarySection[] = [
    {
      id: 'account',
      title: 'Data Akun & Kontak',
      description: `${accountItems.length} data terisi`,
      items: accountItems,
    },
    {
      id: 'personal',
      title: 'Data Pribadi & Alamat',
      description: `${personalItems.length} data terisi`,
      items: personalItems,
    },
  ];

  const role = normalizeText(user.role).toUpperCase();
  if (['TEACHER', 'PRINCIPAL', 'STAFF', 'EXTRACURRICULAR_TUTOR', 'EXAMINER'].includes(role)) {
    sections.push({
      id: 'employment',
      title: 'Data Kepegawaian',
      description: `${employmentItems.length} data terisi`,
      items: employmentItems,
    });
  }

  if (['STUDENT', 'CALON_SISWA'].includes(role)) {
    sections.push({
      id: 'student',
      title: 'Data Siswa',
      description: `${studentItems.length} data terisi`,
      items: studentItems,
    });
    sections.push({
      id: 'family',
      title: 'Data Orang Tua / Wali',
      description: `${familyItems.length} data terisi`,
      items: familyItems,
    });
  }

  if (role === 'PARENT') {
    sections.push({
      id: 'parent',
      title: 'Data Anak Tertaut',
      description: `${Array.isArray(user.children) ? user.children.length : 0} anak terhubung`,
      items: parentItems,
    });
  }

  return sections.filter((section) => section.items.length > 0);
}

export default function ProfileSummaryPrint() {
  const navigate = useNavigate();
  const documentQuery = useQuery({
    queryKey: ['profile-print-summary'],
    queryFn: async () => {
      const response = await api.get('/users/me/print-summary');
      return response.data?.data as ProfilePrintSummaryResponse;
    },
  });

  const sections = useMemo(
    () => (documentQuery.data ? buildSummarySections(documentQuery.data.user) : []),
    [documentQuery.data],
  );

  if (documentQuery.isLoading) {
    return <div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-600">Menyiapkan ringkasan profil...</div>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-rose-700">Gagal memuat ringkasan profil.</p>
          <button
            type="button"
            onClick={() => documentQuery.refetch()}
            className="mt-4 inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const { documentHeader, generatedAt, user } = documentQuery.data;
  const educationHistories = Array.isArray(user.educationHistories)
    ? user.educationHistories.filter((entry) =>
        Boolean(
          normalizeText(entry.institutionName) ||
            normalizeText(entry.studyProgram) ||
            normalizeText(entry.degree) ||
            normalizeText(entry.nrg) ||
            (entry.documents || []).length > 0,
        ),
      )
    : [];
  const supportingDocuments = Array.isArray(user.documents)
    ? user.documents.filter((document) => normalizeText(document.fileUrl))
    : [];

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Profil
        </button>
      </div>

      <PrintLayout title={`Ringkasan Profil - ${user.name || user.username}`}>
        <StandardSchoolDocumentHeader header={documentHeader} />

        <div className="mt-3 text-center">
          <div className="text-[20px] font-bold uppercase tracking-[0.08em] text-slate-900">Ringkasan Profil Pengguna</div>
          <div className="mt-1 text-[13px] font-semibold uppercase text-slate-700">{formatRoleLabel(user.role)}</div>
          <div className="mt-1 text-[12px] text-slate-500">
            Dicetak pada {formatDate(generatedAt) || '-'}
            {formatTime(generatedAt) ? ` pukul ${formatTime(generatedAt)} WIB` : ''}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Nama</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{user.name || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Username</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{user.username || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status Verifikasi</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{formatVerificationLabel(user.verificationStatus)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ringkasan Komponen</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{sections.length} komponen tercetak</div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Ringkasan Per Komponen</div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">Komponen</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">Ringkasan</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">Data Terisi</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <tr key={section.id}>
                    <td className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">{section.title}</td>
                    <td className="border-b border-slate-200 px-4 py-3 text-slate-600">{section.description}</td>
                    <td className="border-b border-slate-200 px-4 py-3 text-slate-600">{section.items.length}</td>
                  </tr>
                ))}
                <tr>
                  <td className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Riwayat Pendidikan</td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-600">
                    {educationHistories.length} jenjang, {educationHistories.reduce((sum, entry) => sum + (entry.documents?.length || 0), 0)} dokumen
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-600">{educationHistories.length}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900">Dokumen Pendukung</td>
                  <td className="px-4 py-3 text-slate-600">{supportingDocuments.length} file</td>
                  <td className="px-4 py-3 text-slate-600">{supportingDocuments.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {sections.map((section) => (
            <section key={section.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">{section.title}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {section.items.map((item) => (
                  <div key={`${section.id}-${item.label}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{item.label}</div>
                    <div className="mt-1 whitespace-pre-line text-sm text-slate-900">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Riwayat Pendidikan</div>
            {educationHistories.length > 0 ? (
              <div className="mt-3 space-y-3">
                {educationHistories.map((history, index) => (
                  <div key={`${history.level}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    {(() => {
                      const documents = Array.isArray(history.documents) ? history.documents : [];
                      return (
                        <>
                          <div className="text-sm font-semibold text-slate-900">{resolveEducationLevelLabel(history.level)}</div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2 text-sm text-slate-700">
                            {normalizeText(history.institutionName) ? <div>Institusi: {history.institutionName}</div> : null}
                            {normalizeText(history.faculty) ? <div>Fakultas: {history.faculty}</div> : null}
                            {normalizeText(history.studyProgram) ? <div>Program Studi/Jurusan: {history.studyProgram}</div> : null}
                            {normalizeText(history.degree) ? <div>Gelar Akademik: {history.degree}</div> : null}
                            {normalizeText(history.gpa) ? <div>IPK: {history.gpa}</div> : null}
                            {normalizeText(history.nrg) ? <div>NRG: {history.nrg}</div> : null}
                          </div>
                          <div className="mt-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Dokumen</div>
                            <div className="mt-1 text-sm text-slate-700">
                              {documents.length > 0
                                ? documents
                                    .map(
                                      (document) =>
                                        normalizeText(document.label) ||
                                        normalizeText(document.originalName) ||
                                        resolveDocumentLabel(document.kind),
                                    )
                                    .filter(Boolean)
                                    .join(', ')
                                : '-'}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Belum ada riwayat pendidikan yang tersimpan.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Dokumen Pendukung</div>
            {supportingDocuments.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">Judul</th>
                      <th className="border-b border-slate-200 px-4 py-3 font-semibold">Kategori</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportingDocuments.map((document, index) => (
                      <tr key={`${document.fileUrl}-${index}`}>
                        <td className="border-b border-slate-200 px-4 py-3 text-slate-900">{document.title || 'Dokumen'}</td>
                        <td className="border-b border-slate-200 px-4 py-3 text-slate-600">{normalizeText(document.category) || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Belum ada dokumen pendukung yang tersimpan.
              </div>
            )}
          </section>
        </div>
      </PrintLayout>
    </div>
  );
}
