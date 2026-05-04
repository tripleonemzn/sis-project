type AcademicYearContextNoticeVariant = 'report' | 'config';

type AcademicYearContextNoticeProps = {
  variant: AcademicYearContextNoticeVariant;
  title: string;
  description: string;
  selectedYearName?: string | null;
  isActiveYear?: boolean | null;
};

const variantStyles: Record<AcademicYearContextNoticeVariant, string> = {
  report: 'border-blue-200 bg-blue-50 text-blue-800',
  config: 'border-amber-200 bg-amber-50 text-amber-800',
};

export default function AcademicYearContextNotice({
  variant,
  title,
  description,
  selectedYearName,
  isActiveYear,
}: AcademicYearContextNoticeProps) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${variantStyles[variant]}`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 leading-relaxed opacity-90">{description}</p>
        </div>
        {selectedYearName ? (
          <span className="inline-flex w-fit shrink-0 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">
            {selectedYearName}
            {typeof isActiveYear === 'boolean' ? (isActiveYear ? ' (Aktif)' : ' (Arsip/Draft)') : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}
