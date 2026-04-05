import { CalendarDays } from 'lucide-react';

type ActiveAcademicYearNoticeProps = {
  name?: string | null;
  semester?: 'ODD' | 'EVEN' | string | null;
  helperText?: string;
  className?: string;
};

function resolveSemesterLabel(value?: 'ODD' | 'EVEN' | string | null) {
  if (value === 'EVEN') return 'Semester Genap';
  if (value === 'ODD') return 'Semester Ganjil';
  return '';
}

export function ActiveAcademicYearNotice({
  name,
  semester,
  helperText = 'Seluruh data operasional di halaman ini otomatis mengikuti tahun ajaran aktif yang tampil di header aplikasi.',
  className,
}: ActiveAcademicYearNoticeProps) {
  const semesterLabel = resolveSemesterLabel(semester);

  return (
    <div
      className={[
        'rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white shadow-sm">
          <CalendarDays className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Tahun Ajaran Aktif</p>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Aktif
            </span>
            {semesterLabel ? (
              <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                {semesterLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{name || '-'}</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-800/80">{helperText}</p>
        </div>
      </div>
    </div>
  );
}

export default ActiveAcademicYearNotice;
