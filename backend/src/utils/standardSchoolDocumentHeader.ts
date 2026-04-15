import prisma from './prisma';

export type StandardSchoolDocumentHeaderSnapshot = {
  foundationName: string;
  schoolFormalName: string;
  competencyNames: string[];
  nss: string;
  npsn: string;
  accreditationLabel: string;
  campuses: Array<{
    label: string;
    address: string;
  }>;
  email: string;
  website: string;
  foundationLogoPath: string;
  schoolLogoPath: string;
};

const SCHOOL_LOGO_PATH = '/logo-kgb2.png';
const FOUNDATION_LOGO_PATH = '/logo-yayasan.png';
const SCHOOL_FOUNDATION_NAME = 'YAYASAN PENDIDIKAN AL AMIEN';
const SCHOOL_FORMAL_NAME = 'SEKOLAH MENENGAH KEJURUAN (SMK) KARYA GUNA BHAKTI 2';
const SCHOOL_NSS = '342026504072';
const SCHOOL_NPSN = '20223112';
const SCHOOL_ACCREDITATION_LABEL = 'STATUS TERAKREDITASI A';
const SCHOOL_EMAIL = 'info@siskgb2.id';
const SCHOOL_WEBSITE = 'www.smkkgb2.sch.id | www.siskgb2.id';
const SCHOOL_CAMPUSES = [
  {
    label: 'Kampus A',
    address: 'Jl. Anggrek 1 RT. 002/016 Duren Jaya Kota Bekasi Telp. (021) 88352851',
  },
  {
    label: 'Kampus B',
    address: 'Jl. H. Ujan RT. 05/07 Duren Jaya Kota Bekasi Telp. 081211625618',
  },
] as const;
const FALLBACK_COMPETENCY_NAMES = [
  'Teknik Komputer dan Jaringan',
  'Manajemen Perkantoran',
  'Akuntansi',
] as const;

function normalizeOptionalText(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

export async function resolveStandardSchoolDocumentHeaderSnapshot(): Promise<StandardSchoolDocumentHeaderSnapshot> {
  const majors = await prisma.major.findMany({
    select: {
      name: true,
    },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });

  const competencyNames = Array.from(
    new Set(
      majors
        .map((major) => normalizeOptionalText(major.name))
        .filter(Boolean) as string[],
    ),
  );

  return {
    foundationName: SCHOOL_FOUNDATION_NAME,
    schoolFormalName: SCHOOL_FORMAL_NAME,
    competencyNames: competencyNames.length > 0 ? competencyNames : Array.from(FALLBACK_COMPETENCY_NAMES),
    nss: SCHOOL_NSS,
    npsn: SCHOOL_NPSN,
    accreditationLabel: SCHOOL_ACCREDITATION_LABEL,
    campuses: SCHOOL_CAMPUSES.map((campus) => ({
      label: campus.label,
      address: campus.address,
    })),
    email: SCHOOL_EMAIL,
    website: SCHOOL_WEBSITE,
    foundationLogoPath: FOUNDATION_LOGO_PATH,
    schoolLogoPath: SCHOOL_LOGO_PATH,
  };
}
