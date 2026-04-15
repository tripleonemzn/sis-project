import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import PrintLayout from './PrintLayout';
import { DEFAULT_SUPPORTING_DOCUMENT_TEMPLATES } from '../../features/profileDocuments/supportingDocuments';

type PrintUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  verificationStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
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
  generatedAt: string;
  formalPhotoUrl?: string | null;
  verification: {
    token: string;
    verificationUrl: string;
    verificationQrDataUrl: string;
  };
  user: PrintUser;
};

type PrintRow = {
  label: string;
  value: string;
};

type PrintSection = {
  id: string;
  title: string;
  rows: PrintRow[];
};

type EducationBlock = {
  title: string;
  rows: PrintRow[];
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

function normalizeTitle(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMediaUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/api/uploads/${raw.replace(/^\/+/, '')}`;
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

function formatDateTime(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pushIfValue(rows: PrintRow[], label: string, value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return;
  rows.push({ label, value: normalized });
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

function resolveDocumentKindLabel(kind?: string | null) {
  const normalized = normalizeText(kind).toUpperCase();
  const map: Record<string, string> = {
    IJAZAH: 'Ijazah',
    SKHUN: 'SKHUN / Dokumen Sejenis',
    TRANSKRIP: 'Transkrip Nilai',
    SERTIFIKAT: 'Sertifikat',
  };
  return map[normalized] || normalized || '-';
}

function getExpectedEducationDocumentKinds(level?: string | null) {
  const normalized = normalizeText(level).toUpperCase();
  if (normalized === 'CERTIFICATION') return ['SERTIFIKAT', 'TRANSKRIP'];
  if (['D3', 'D4_S1', 'S2', 'S3'].includes(normalized)) return ['IJAZAH', 'TRANSKRIP'];
  if (['TK', 'SD', 'SMP_MTS'].includes(normalized)) return ['IJAZAH', 'SKHUN'];
  return ['IJAZAH'];
}

function buildProfileSections(user: PrintUser): PrintSection[] {
  const accountRows: PrintRow[] = [];
  pushIfValue(accountRows, 'Nama Lengkap', user.name);
  pushIfValue(accountRows, 'Username', user.username);
  pushIfValue(accountRows, 'Role', formatRoleLabel(user.role));
  pushIfValue(accountRows, 'Status Verifikasi', formatVerificationLabel(user.verificationStatus));
  pushIfValue(accountRows, 'Email', user.email);
  pushIfValue(accountRows, 'No. Telepon', user.phone);

  const personalRows: PrintRow[] = [];
  pushIfValue(personalRows, 'Jenis Kelamin', user.gender === 'MALE' ? 'Laki-laki' : user.gender === 'FEMALE' ? 'Perempuan' : '');
  pushIfValue(personalRows, 'Tempat Lahir', user.birthPlace);
  pushIfValue(personalRows, 'Tanggal Lahir', formatDate(user.birthDate));
  pushIfValue(personalRows, 'Kewarganegaraan', user.citizenship);
  pushIfValue(personalRows, 'Agama', user.religion);
  pushIfValue(personalRows, 'Status Perkawinan', user.maritalStatus);
  pushIfValue(personalRows, 'NIK', user.nik);
  pushIfValue(personalRows, 'No. KK', user.familyCardNumber);
  pushIfValue(personalRows, 'Alamat', user.address);
  pushIfValue(personalRows, 'RT / RW', [normalizeText(user.rt), normalizeText(user.rw)].filter(Boolean).join(' / '));
  pushIfValue(personalRows, 'Dusun', user.dusun);
  pushIfValue(personalRows, 'Kelurahan / Desa', user.village);
  pushIfValue(personalRows, 'Kecamatan', user.subdistrict);
  pushIfValue(personalRows, 'Kabupaten / Kota', user.cityRegency);
  pushIfValue(personalRows, 'Provinsi', user.province);
  pushIfValue(personalRows, 'Kode Pos', user.postalCode);

  const employmentRows: PrintRow[] = [];
  pushIfValue(employmentRows, 'NIP', user.nip);
  pushIfValue(employmentRows, 'NUPTK', user.nuptk);
  pushIfValue(employmentRows, 'Jenis PTK', user.ptkType);
  pushIfValue(employmentRows, 'Status Kepegawaian', user.employeeStatus);
  pushIfValue(employmentRows, 'Status Aktif', user.employeeActiveStatus);
  pushIfValue(employmentRows, 'Sumber Gaji', user.salarySource);
  pushIfValue(employmentRows, 'Institusi', user.institution);
  pushIfValue(employmentRows, 'SK Pengangkatan', user.appointmentDecree);
  pushIfValue(employmentRows, 'TMT Pengangkatan', formatDate(user.appointmentDate));
  pushIfValue(employmentRows, 'SK Penugasan', user.assignmentDecree);
  pushIfValue(employmentRows, 'Tanggal Penugasan', formatDate(user.assignmentDate));
  pushIfValue(employmentRows, 'Tugas Tambahan', formatDutyLabels(user.additionalDuties));
  pushIfValue(
    employmentRows,
    'Kakom / Major Kelolaan',
    Array.isArray(user.managedMajors)
      ? user.managedMajors.map((major) => normalizeText(major.code) || normalizeText(major.name)).filter(Boolean).join(', ')
      : '',
  );
  pushIfValue(
    employmentRows,
    'Major Penguji',
    normalizeText(user.examinerMajor?.code) || normalizeText(user.examinerMajor?.name),
  );

  const studentRows: PrintRow[] = [];
  pushIfValue(studentRows, 'NIS', user.nis);
  pushIfValue(studentRows, 'NISN', user.nisn);
  pushIfValue(studentRows, 'Kelas Aktif', normalizeText(user.studentClass?.name));
  pushIfValue(
    studentRows,
    'Kompetensi Keahlian',
    normalizeText(user.studentClass?.major?.code) || normalizeText(user.studentClass?.major?.name),
  );
  pushIfValue(studentRows, 'Anak ke-', user.childNumber);
  pushIfValue(studentRows, 'Jumlah Saudara', user.siblingsCount);
  pushIfValue(studentRows, 'Status Dalam Keluarga', user.familyStatus);
  pushIfValue(studentRows, 'Tinggal Bersama', user.livingWith);
  pushIfValue(studentRows, 'Jarak ke Sekolah', user.distanceToSchool);
  pushIfValue(studentRows, 'Moda Transportasi', user.transportationMode);
  pushIfValue(studentRows, 'Waktu Tempuh', user.travelTimeToSchool);
  pushIfValue(studentRows, 'No. KIP', user.kipNumber);
  pushIfValue(studentRows, 'No. PKH', user.pkhNumber);
  pushIfValue(studentRows, 'No. KKS', user.kksNumber);

  const familyRows: PrintRow[] = [];
  pushIfValue(familyRows, 'Nama Ayah', user.fatherName);
  pushIfValue(familyRows, 'NIK Ayah', user.fatherNik);
  pushIfValue(familyRows, 'Pendidikan Ayah', user.fatherEducation);
  pushIfValue(familyRows, 'Pekerjaan Ayah', user.fatherOccupation);
  pushIfValue(familyRows, 'Penghasilan Ayah', user.fatherIncome);
  pushIfValue(familyRows, 'Nama Ibu', user.motherName);
  pushIfValue(familyRows, 'NIK Ibu', user.motherNik);
  pushIfValue(familyRows, 'Pendidikan Ibu', user.motherEducation);
  pushIfValue(familyRows, 'Pekerjaan Ibu', user.motherOccupation);
  pushIfValue(familyRows, 'Penghasilan Ibu', user.motherIncome);
  pushIfValue(familyRows, 'Nama Wali', user.guardianName);
  pushIfValue(familyRows, 'Pendidikan Wali', user.guardianEducation);
  pushIfValue(familyRows, 'Pekerjaan Wali', user.guardianOccupation);
  pushIfValue(familyRows, 'No. Telepon Wali', user.guardianPhone);

  const parentRows: PrintRow[] = [];
  const childrenSummary = (user.children || [])
    .map((child) => {
      const parts = [normalizeText(child.name)];
      if (normalizeText(child.nisn)) parts.push(`NISN ${normalizeText(child.nisn)}`);
      return parts.join(' • ');
    })
    .filter(Boolean)
    .join(', ');
  pushIfValue(parentRows, 'Anak Tertaut', childrenSummary);

  const sections: PrintSection[] = [
    { id: 'account', title: 'Data Akun & Kontak', rows: accountRows },
    { id: 'personal', title: 'Data Pribadi & Alamat', rows: personalRows },
  ];

  const role = normalizeText(user.role).toUpperCase();
  if (['TEACHER', 'PRINCIPAL', 'STAFF', 'EXTRACURRICULAR_TUTOR', 'EXAMINER'].includes(role)) {
    sections.push({ id: 'employment', title: 'Data Kepegawaian', rows: employmentRows });
  }
  if (['STUDENT', 'CALON_SISWA'].includes(role)) {
    sections.push({ id: 'student', title: 'Data Siswa', rows: studentRows });
    sections.push({ id: 'family', title: 'Data Orang Tua / Wali', rows: familyRows });
  }
  if (role === 'PARENT') {
    sections.push({ id: 'parent', title: 'Data Anak Tertaut', rows: parentRows });
  }

  return sections.filter((section) => section.rows.length > 0);
}

function buildEducationBlocks(user: PrintUser): EducationBlock[] {
  const histories = Array.isArray(user.educationHistories) ? user.educationHistories : [];
  const isFilledHistory = (entry: NonNullable<PrintUser['educationHistories']>[number]) => {
    const documents = Array.isArray(entry.documents) ? entry.documents : [];
    return Boolean(
      normalizeText(entry.institutionName) ||
        normalizeText(entry.faculty) ||
        normalizeText(entry.studyProgram) ||
        normalizeText(entry.gpa) ||
        normalizeText(entry.degree) ||
        normalizeText(entry.nrg) ||
        documents.some((document) => normalizeText(document.fileUrl)),
    );
  };

  const regularHistories = histories.filter(
    (entry) => normalizeText(entry.level).toUpperCase() !== 'CERTIFICATION' && isFilledHistory(entry),
  );

  const blocks = regularHistories.map((history) => {
    const rows: PrintRow[] = [];
    pushIfValue(rows, 'Nama Institusi', history.institutionName);
    pushIfValue(rows, 'Fakultas', history.faculty);
    pushIfValue(rows, 'Program Studi/Jurusan', history.studyProgram);
    pushIfValue(rows, 'Gelar Akademik', history.degree);
    pushIfValue(rows, 'IPK', history.gpa);
    pushIfValue(rows, 'NRG', history.nrg);

    const documents = Array.isArray(history.documents) ? history.documents : [];
    const uploadedKinds = new Set(
      documents
        .filter((document) => normalizeText(document.fileUrl))
        .map((document) => normalizeText(document.kind).toUpperCase())
        .filter(Boolean),
    );
    const documentStatuses = getExpectedEducationDocumentKinds(history.level).map((kind) => ({
      label: resolveDocumentKindLabel(kind),
      status: uploadedKinds.has(kind) ? 'Sudah upload' : 'Belum upload',
    }));
    if (documentStatuses.length > 0) {
      rows.push({
        label: 'Dokumen',
        value: documentStatuses.map((item) => `${item.label}: ${item.status}`).join(' | '),
      });
    }

    return {
      title: resolveEducationLevelLabel(history.level),
      rows,
    };
  });

  const role = normalizeText(user.role).toUpperCase();
  const shouldShowCertificationFallback = !['STUDENT', 'CALON_SISWA', 'PARENT'].includes(role);
  const certificationHistory =
    histories.find((history) => normalizeText(history.level).toUpperCase() === 'CERTIFICATION') || null;

  if (shouldShowCertificationFallback) {
    const certificationRows: PrintRow[] = [];
    const uploadedCertificationKinds = new Set(
      (Array.isArray(certificationHistory?.documents) ? certificationHistory.documents : [])
        .filter((document) => normalizeText(document.fileUrl))
        .map((document) => normalizeText(document.kind).toUpperCase())
        .filter(Boolean),
    );
    const hasCompletedCertification =
      Boolean(normalizeText(certificationHistory?.institutionName)) &&
      Boolean(normalizeText(certificationHistory?.studyProgram)) &&
      Boolean(normalizeText(certificationHistory?.degree)) &&
      Boolean(normalizeText(certificationHistory?.nrg));

    if (hasCompletedCertification) {
      pushIfValue(certificationRows, 'Nama Perguruan Tinggi', certificationHistory?.institutionName);
      pushIfValue(certificationRows, 'Program Studi/Jurusan', certificationHistory?.studyProgram);
      pushIfValue(certificationRows, 'Gelar Akademik', certificationHistory?.degree);
      pushIfValue(certificationRows, 'NRG', certificationHistory?.nrg);
      certificationRows.push({
        label: 'Dokumen',
        value: [
          `Sertifikat: ${uploadedCertificationKinds.has('SERTIFIKAT') ? 'Sudah upload' : 'Belum upload'}`,
          `Transkrip Nilai: ${uploadedCertificationKinds.has('TRANSKRIP') ? 'Sudah upload' : 'Belum upload'}`,
        ].join(' | '),
      });
    } else {
      certificationRows.push({
        label: 'Keterangan',
        value: 'Belum sertifikasi',
      });
    }

    blocks.push({
      title: 'Sertifikasi',
      rows: certificationRows,
    });
  }

  return blocks.filter((block) => block.rows.length > 0);
}

function buildSupportingDocumentRows(user: PrintUser): PrintRow[] {
  const uploadedDocuments = Array.isArray(user.documents) ? user.documents : [];
  const uploadedTitleSet = new Set(
    uploadedDocuments
      .filter((document) => normalizeText(document.fileUrl))
      .map((document) => normalizeTitle(document.title))
      .filter(Boolean),
  );

  const rows = DEFAULT_SUPPORTING_DOCUMENT_TEMPLATES.map((template) => ({
    label: template.title,
    value: uploadedTitleSet.has(normalizeTitle(template.title)) ? 'Sudah upload' : 'Belum upload',
  }));

  const defaultTitles = new Set(DEFAULT_SUPPORTING_DOCUMENT_TEMPLATES.map((template) => normalizeTitle(template.title)));
  const customCount = uploadedDocuments.filter(
    (document) => normalizeText(document.fileUrl) && !defaultTitles.has(normalizeTitle(document.title)),
  ).length;
  rows.push({
    label: 'Dokumen Tambahan',
    value: customCount > 0 ? `${customCount} file sudah upload` : 'Belum upload',
  });

  return rows;
}

function SimpleSection({ title, rows }: { title: string; rows: PrintRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-[15px] font-medium uppercase tracking-[0.02em] text-[#0066cc]">{title}</h2>
      <table className="mt-4 w-full border-collapse text-[13px] leading-7 text-black">
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.label}`}>
              <td className="w-[190px] align-top pr-4">{row.label}</td>
              <td className="w-[20px] align-top text-center">:</td>
              <td className="align-top whitespace-pre-line">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
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
    () => (documentQuery.data ? buildProfileSections(documentQuery.data.user) : []),
    [documentQuery.data],
  );

  const educationBlocks = useMemo(
    () => (documentQuery.data ? buildEducationBlocks(documentQuery.data.user) : []),
    [documentQuery.data],
  );

  const supportingDocumentRows = useMemo(
    () => (documentQuery.data ? buildSupportingDocumentRows(documentQuery.data.user) : []),
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

  const { generatedAt, formalPhotoUrl, verification, user } = documentQuery.data;
  const printableRole = formatRoleLabel(user.role).toUpperCase();

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
        <div className="mx-auto max-w-[760px] text-black" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <div className="flex justify-center">
            {formalPhotoUrl ? (
              <div className="h-[180px] w-[120px] overflow-hidden border border-[#3b6bbd]">
                <img
                  src={resolveMediaUrl(formalPhotoUrl)}
                  alt={`Foto formal ${user.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-[180px] w-[120px] items-center justify-center border border-[#3b6bbd] px-3 text-center text-[12px] leading-6 text-black">
                DI AMBIL DARI FOTO FORMAL YANG ADA DI DOKUMEN PENDUKUNG (PASTIKAN UKURAN 4X6)
              </div>
            )}
          </div>

          <div className="mt-8 text-center text-[18px] font-normal uppercase">
            Ringkasan Profil [{printableRole}]
          </div>

          {sections.map((section) => (
            <SimpleSection key={section.id} title={section.title} rows={section.rows} />
          ))}

          {educationBlocks.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-[15px] font-medium uppercase tracking-[0.02em] text-[#0066cc]">Riwayat Pendidikan</h2>
              <div className="mt-4 space-y-6">
                {educationBlocks.map((block) => (
                  <div key={block.title}>
                    <div className="text-[13px] font-semibold uppercase text-slate-800">{block.title}</div>
                    <table className="mt-2 w-full border-collapse text-[13px] leading-7 text-black">
                      <tbody>
                        {block.rows.map((row) => (
                          <tr key={`${block.title}-${row.label}`}>
                            <td className="w-[190px] align-top pr-4">{row.label}</td>
                            <td className="w-[20px] align-top text-center">:</td>
                            <td className="align-top whitespace-pre-line">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <SimpleSection title="Dokumen Pendukung" rows={supportingDocumentRows} />

          <div className="mt-12 flex flex-col items-center">
            <img
              src={verification.verificationQrDataUrl}
              alt="Barcode Verifikasi Ringkasan Profil"
              className="h-[120px] w-[120px] object-contain"
            />
            <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-700">
              Barcode Verifikasi
            </div>
            <div className="mt-1 text-center text-[11px] leading-5 text-slate-500">
              Scan barcode ini untuk memverifikasi keaslian ringkasan profil di sistem SIS KGB2.
            </div>
            <div className="mt-1 text-center text-[11px] text-slate-500">
              Dicetak pada {formatDateTime(generatedAt)}
            </div>
            <div className="mt-2 break-all text-center text-[10px] text-slate-400">{verification.verificationUrl}</div>
          </div>
        </div>
      </PrintLayout>
    </div>
  );
}
