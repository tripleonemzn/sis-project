type StandardSchoolDocumentHeaderCampus = {
  label: string;
  address: string;
};

export type StandardSchoolDocumentHeaderSnapshot = {
  foundationName: string;
  schoolFormalName: string;
  competencyNames: string[];
  nss: string;
  npsn: string;
  accreditationLabel: string;
  campuses: StandardSchoolDocumentHeaderCampus[];
  email: string;
  website: string;
  foundationLogoPath: string;
  schoolLogoPath: string;
};

function escapeHtml(value?: string | null) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAbsoluteAssetUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  return new URL(raw, window.location.origin).toString();
}

function normalizeHeader(header: StandardSchoolDocumentHeaderSnapshot) {
  const competencyNames = Array.from(
    new Set(
      (header.competencyNames || [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );

  return {
    ...header,
    competencyNames,
    campuses: Array.isArray(header.campuses) ? header.campuses : [],
  };
}

export function buildStandardSchoolDocumentHeaderHtml(header: StandardSchoolDocumentHeaderSnapshot) {
  const normalizedHeader = normalizeHeader(header);
  const foundationLogoUrl = resolveAbsoluteAssetUrl(normalizedHeader.foundationLogoPath);
  const schoolLogoUrl = resolveAbsoluteAssetUrl(normalizedHeader.schoolLogoPath);
  const competencyLine = normalizedHeader.competencyNames.map(escapeHtml).join(' &nbsp; | &nbsp; ');
  const campusesHtml = normalizedHeader.campuses
    .map(
      (campus) =>
        `<div style="margin:0;font-size:10px;">${escapeHtml(campus.label)} : ${escapeHtml(campus.address)}</div>`,
    )
    .join('');

  return `
    <div style="margin:0 0 18px 0;color:#000;font-family:'Times New Roman', Times, serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:4px;">
        <div style="width:95px;display:flex;justify-content:center;align-items:center;">
          <img src="${escapeHtml(foundationLogoUrl)}" alt="Logo Yayasan" style="width:88px;height:auto;object-fit:contain;" />
        </div>
        <div style="flex:1;padding:0 10px;text-align:center;line-height:1.15;">
          <div style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(normalizedHeader.foundationName)}</div>
          <div style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;">${escapeHtml(normalizedHeader.schoolFormalName)}</div>
          <div style="margin:0;font-size:12px;">${competencyLine}</div>
          <div style="margin:0;font-size:12px;">NSS : ${escapeHtml(normalizedHeader.nss)} &nbsp; | &nbsp; NPSN : ${escapeHtml(normalizedHeader.npsn)}</div>
          <div style="margin:2px 0 0;font-size:14px;font-weight:700;text-transform:uppercase;">${escapeHtml(normalizedHeader.accreditationLabel)}</div>
          ${campusesHtml}
          <div style="margin:0;font-size:10px;">Email : ${escapeHtml(normalizedHeader.email)} &nbsp; | &nbsp; Website : ${escapeHtml(normalizedHeader.website)}</div>
        </div>
        <div style="width:95px;display:flex;justify-content:center;align-items:center;">
          <img src="${escapeHtml(schoolLogoUrl)}" alt="Logo Sekolah" style="width:88px;height:auto;object-fit:contain;" />
        </div>
      </div>
      <div style="margin-top:4px;border-top:1px solid #000;"></div>
      <div style="margin-top:2px;border-top:2px solid #000;"></div>
    </div>
  `;
}

export function StandardSchoolDocumentHeader({ header }: { header: StandardSchoolDocumentHeaderSnapshot }) {
  const normalizedHeader = normalizeHeader(header);
  const competencyLine = normalizedHeader.competencyNames.join('  |  ');

  return (
    <div className="mb-5 text-black" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
      <div className="flex items-center justify-between pb-1">
        <div className="flex w-[95px] items-center justify-center">
          <img src={normalizedHeader.foundationLogoPath} alt="Logo Yayasan" className="h-auto w-[88px] object-contain" />
        </div>
        <div className="flex-1 px-2 text-center" style={{ lineHeight: '1.15' }}>
          <div className="m-0 text-[14px] font-bold uppercase tracking-[0.3px]">{normalizedHeader.foundationName}</div>
          <div className="m-0 text-[14px] font-bold uppercase">{normalizedHeader.schoolFormalName}</div>
          <div className="m-0 text-[12px]">{competencyLine}</div>
          <div className="m-0 text-[12px]">NSS : {normalizedHeader.nss}  |  NPSN : {normalizedHeader.npsn}</div>
          <div className="mt-0.5 mb-0 text-[14px] font-bold uppercase">{normalizedHeader.accreditationLabel}</div>
          {normalizedHeader.campuses.map((campus) => (
            <div key={`${campus.label}-${campus.address}`} className="m-0 text-[10px]">
              {campus.label} : {campus.address}
            </div>
          ))}
          <div className="m-0 text-[10px]">
            Email : {normalizedHeader.email}  |  Website : {normalizedHeader.website}
          </div>
        </div>
        <div className="flex w-[95px] items-center justify-center">
          <img src={normalizedHeader.schoolLogoPath} alt="Logo Sekolah" className="h-auto w-[88px] object-contain" />
        </div>
      </div>
      <div className="mt-1 border-t border-black" />
      <div className="mt-0.5 border-t-2 border-black" />
    </div>
  );
}
