import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../../services/api';

interface HomeroomLedgerPageProps {
  classId: number;
  semester: 'ODD' | 'EVEN' | '';
  reportType?: string;
  programCode?: string;
  reportComponentType?: string;
}

interface LedgerGrade {
  nf1: number | null;
  nf2: number | null;
  nf3: number | null;
  nf4?: number | null;
  nf5?: number | null;
  nf6?: number | null;
  formatif: number | null;
  sbts: number | null;
  finalComponent?: number | null;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
  slotScores?: Record<string, number | null>;
}

interface LedgerStudent {
  id: number;
  name: string;
  nis: string | null;
  nisn: string | null;
  grades: Record<number, LedgerGrade>;
}

interface LedgerSubject {
  id: number;
  name: string;
  code: string;
}

interface LedgerResponse {
  subjects: LedgerSubject[];
  students: LedgerStudent[];
  meta?: {
    reportType?: string;
    reportComponentType?: string;
    reportComponentMode?: string;
    col1Label?: string;
    col2Label?: string;
    formativeSlotCode?: string;
    midtermSlotCode?: string;
    finalSlotCode?: string;
  };
}

const normalizeLedgerCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const isMidtermAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(normalized)) return true;
  return normalized.includes('MIDTERM');
};

const isFinalAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT'].includes(normalized)) return true;
  return normalized.includes('FINAL');
};

export const HomeroomLedgerPage = ({
  classId,
  semester,
  reportType = '',
  programCode,
  reportComponentType: reportComponentTypeProp,
}: HomeroomLedgerPageProps) => {
  const normalizedReportType = normalizeLedgerCode(reportType);

  const { data: ledgerData, isLoading, error } = useQuery<LedgerResponse>({
    queryKey: ['class-ledger', classId, semester, normalizedReportType, String(programCode || '')],
    queryFn: async () => {
      const response = await api.get('/reports/ledger', {
        params: {
          classId,
          semester,
          ...(programCode ? { programCode } : {}),
          ...(!programCode && normalizedReportType ? { reportType: normalizedReportType } : {}),
        }
      });
      return response.data.data;
    },
    enabled: !!classId && !!semester
  });

  const reportComponentMode = String(ledgerData?.meta?.reportComponentMode || '')
    .trim()
    .toUpperCase();
  const reportComponentType = String(ledgerData?.meta?.reportComponentType || '')
    .trim()
    .toUpperCase();
  const normalizedComponentTypeProp = String(reportComponentTypeProp || '')
    .trim()
    .toUpperCase();
  const fallbackAsMidterm =
    isMidtermAliasCode(normalizedComponentTypeProp) ||
    isMidtermAliasCode(normalizedReportType);
  const fallbackAsFinal =
    isFinalAliasCode(normalizedComponentTypeProp) ||
    isFinalAliasCode(normalizedReportType) ||
    (Boolean(normalizedReportType) && !fallbackAsMidterm);
  const isMidtermView =
    isMidtermAliasCode(reportComponentMode) ||
    isMidtermAliasCode(reportComponentType) ||
    (!reportComponentType && fallbackAsMidterm);
  const isFinalView =
    isFinalAliasCode(reportComponentMode) ||
    isFinalAliasCode(reportComponentType) ||
    (!reportComponentType && fallbackAsFinal);

  if (!semester) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <p className="text-blue-700 font-medium">Silakan pilih semester terlebih dahulu untuk menampilkan data leger nilai.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
        <p className="text-red-700 font-medium">Gagal memuat data leger nilai.</p>
        <p className="text-red-600 text-sm mt-1">Silakan coba lagi beberapa saat lagi.</p>
      </div>
    );
  }

  if (!ledgerData || ledgerData.students.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-500">Tidak ada data siswa atau mata pelajaran untuk kelas ini.</p>
      </div>
    );
  }

  const headerCol1 = ledgerData.meta?.col1Label || (isMidtermView ? 'Komponen 1' : 'Nilai Akhir');
  const headerCol2 = ledgerData.meta?.col2Label || 'Komponen 2';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
              <tr>
                <th className="sticky left-0 bg-gray-50 z-20 px-4 py-3 border-r border-gray-200 w-[50px] min-w-[50px] max-w-[50px] text-center" rowSpan={2}>
                  No
                </th>
                <th className="sticky left-[50px] bg-gray-50 z-20 px-4 py-3 border-r border-gray-200 w-[150px] min-w-[150px] max-w-[150px] text-center" rowSpan={2}>
                  NISN / NIS
                </th>
                <th className="sticky left-[200px] bg-gray-50 z-20 px-4 py-3 border-r border-gray-200 w-[250px] min-w-[250px] max-w-[250px]" rowSpan={2}>
                  Nama Siswa
                </th>
                {ledgerData.subjects.map((subject) => (
                  <th key={subject.id} colSpan={2} className="px-4 py-2 text-center border-r border-gray-200 min-w-[120px]">
                    {subject.name}
                  </th>
                ))}
              </tr>
              <tr>
                {ledgerData.subjects.map((subject) => (
                  <Fragment key={`sub-header-${subject.id}`}>
                    <th className="px-2 py-2 text-center border-r border-gray-200 w-[60px] text-xs">
                      {headerCol1}
                    </th>
                    <th className={isFinalView 
                      ? "px-2 py-2 text-left border-r border-gray-200 w-[240px] min-w-[240px] max-w-[240px] text-xs bg-blue-50" 
                      : "px-2 py-2 text-center border-r border-gray-200 w-[60px] text-xs bg-blue-50"}>
                      {headerCol2}
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ledgerData.students.map((student, index) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white z-10 px-4 py-3 text-center border-r border-gray-200 w-[50px] min-w-[50px] max-w-[50px] font-medium">
                    {index + 1}
                  </td>
                  <td className="sticky left-[50px] bg-white z-10 px-4 py-3 text-center border-r border-gray-200 w-[150px] min-w-[150px] max-w-[150px] text-gray-600">
                     <div className="text-sm font-medium text-gray-900">{student.nisn || '-'}</div>
                     <div className="text-xs text-gray-500">{student.nis || '-'}</div>
                  </td>
                  <td className="sticky left-[200px] bg-white z-10 px-4 py-3 border-r border-gray-200 w-[250px] min-w-[250px] max-w-[250px] font-medium text-gray-900">
                    {student.name}
                  </td>
                  {ledgerData.subjects.map((subject) => {
                    const grades = student.grades[subject.id];
                    
                    let col1Value: React.ReactNode = '-';
                    let col2Value: React.ReactNode = '-';

                    if (isFinalView) {
                      col1Value =
                        grades?.finalScore !== null && grades?.finalScore !== undefined
                          ? Math.round(grades.finalScore)
                          : '-';
                      col2Value = (grades?.description && grades.description.trim() !== '') ? grades.description : '-';
                    } else {
                      col1Value =
                        grades?.formatif !== null && grades?.formatif !== undefined
                          ? Math.round(grades.formatif)
                          : '-';
                      col2Value =
                        grades?.sbts !== null && grades?.sbts !== undefined
                          ? Math.round(grades.sbts)
                          : '-';
                    }

                    return (
                      <Fragment key={`${student.id}-${subject.id}`}>
                        <td className="px-2 py-3 text-center border-r border-gray-200 text-gray-600">
                          {col1Value}
                        </td>
                        <td className={isFinalView 
                          ? "px-2 py-3 text-left border-r border-gray-200 font-medium text-blue-700 bg-blue-50/30 w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words"
                          : "px-2 py-3 text-center border-r border-gray-200 font-medium text-blue-700 bg-blue-50/30"}>
                          {col2Value}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="text-xs text-gray-500 italic mt-2">
        {isFinalView ? (
          <>
            * {headerCol1}: Nilai rapor akhir hasil kalkulasi backend.
            <br />
            * {headerCol2}: Catatan/capaian kompetensi siswa per mata pelajaran.
          </>
        ) : (
          <>
            * {headerCol1}: Rata-rata komponen formatif dari konfigurasi aktif.
            <br />
            * {headerCol2}: Nilai komponen tengah semester dari konfigurasi aktif.
          </>
        )}
        <br />
        * Kolom No, NISN/NIS, dan Nama Siswa bersifat tetap (frozen).
      </div>
    </div>
  );
};
