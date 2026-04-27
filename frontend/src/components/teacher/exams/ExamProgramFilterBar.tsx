import {
  Briefcase,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';

type ProgramTabItem = {
  code: string;
  label?: string | null;
  shortLabel?: string | null;
};

type ExamProgramFilterBarProps = {
  programs: ProgramTabItem[];
  activeProgramCode: string;
  onProgramChange: (code: string) => void;
  semesterValue?: 'ODD' | 'EVEN';
  onSemesterChange?: (value: 'ODD' | 'EVEN') => void;
  showSemester?: boolean;
  semesterDisabled?: boolean;
  emptyMessage?: string;
};

function getProgramTabIcon(programCode: string): LucideIcon {
  const normalized = String(programCode || '').trim().toUpperCase();
  if (normalized === 'SBTS') return CalendarRange;
  if (normalized === 'SAS') return FileSpreadsheet;
  if (normalized === 'SAT') return GraduationCap;
  if (normalized === 'ASAJ') return ClipboardCheck;
  if (normalized === 'ASAJP') return Briefcase;
  return ClipboardList;
}

export default function ExamProgramFilterBar({
  programs,
  activeProgramCode,
  onProgramChange,
  semesterValue = 'ODD',
  onSemesterChange,
  showSemester = false,
  semesterDisabled = false,
  emptyMessage = 'Belum ada Program Ujian aktif pada tahun ajaran ini.',
}: ExamProgramFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {programs.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto border-b border-gray-200 scrollbar-hide">
            {programs.map((program) => {
              const Icon = getProgramTabIcon(program.code);
              return (
                <button
                  key={program.code}
                  type="button"
                  onClick={() => onProgramChange(program.code)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                    activeProgramCode === program.code
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {program.shortLabel || program.label || program.code}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {emptyMessage}
          </p>
        )}
      </div>

      {showSemester && onSemesterChange ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Semester</span>
          <select
            value={semesterValue}
            onChange={(event) => onSemesterChange((event.target.value as 'ODD' | 'EVEN') || 'ODD')}
            disabled={semesterDisabled}
            className={`min-w-[140px] rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${
              semesterDisabled
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600'
                : 'border-gray-300 bg-white'
            }`}
          >
            <option value="ODD">Ganjil</option>
            <option value="EVEN">Genap</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
