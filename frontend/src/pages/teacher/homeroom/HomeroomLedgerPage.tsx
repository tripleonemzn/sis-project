import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../../services/api';

interface HomeroomLedgerPageProps {
  classId: number;
  semester: 'ODD' | 'EVEN' | '';
  reportType?: 'SBTS' | 'SAS' | 'SAT';
}

interface LedgerGrade {
  nf1: number | null;
  nf2: number | null;
  nf3: number | null;
  formatif: number | null;
  sbts: number | null;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
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
}

export const HomeroomLedgerPage = ({ classId, semester, reportType = 'SBTS' }: HomeroomLedgerPageProps) => {
  const { data: ledgerData, isLoading, error } = useQuery<LedgerResponse>({
    queryKey: ['class-ledger', classId, semester],
    queryFn: async () => {
      const response = await api.get('/reports/ledger', {
        params: { classId, semester }
      });
      return response.data.data;
    },
    enabled: !!classId && !!semester
  });

  const isSasOrSat = reportType === 'SAS' || reportType === 'SAT';

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
                      {isSasOrSat ? 'NILAI AKHIR' : 'FORMATIF'}
                    </th>
                    <th className={isSasOrSat 
                      ? "px-2 py-2 text-left border-r border-gray-200 w-[240px] min-w-[240px] max-w-[240px] text-xs bg-blue-50" 
                      : "px-2 py-2 text-center border-r border-gray-200 w-[60px] text-xs bg-blue-50"}>
                      {isSasOrSat ? 'CAPAIAN KOMPETENSI' : 'SBTS'}
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

                    if (isSasOrSat) {
                      col1Value = grades?.finalScore ? Math.round(grades.finalScore) : '-';
                      col2Value = (grades?.description && grades.description.trim() !== '') ? grades.description : '-';
                    } else {
                      col1Value = grades?.formatif ? Math.round(grades.formatif) : '-';
                      col2Value = grades?.sbts ?? '-';
                    }

                    return (
                      <Fragment key={`${student.id}-${subject.id}`}>
                        <td className="px-2 py-3 text-center border-r border-gray-200 text-gray-600">
                          {col1Value}
                        </td>
                        <td className={isSasOrSat 
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
        {isSasOrSat ? (
          <>
            * NILAI AKHIR: Nilai Rapor Akhir Semester.
            <br />
            * CAPAIAN KOMPETENSI: Predikat Capaian Kompetensi (A/B/C/D).
          </>
        ) : (
          <>
            * FORMATIF: Rata-rata Nilai Formatif (NF1, NF2, NF3).
            <br />
            * SBTS: Sumatif Bersama Tengah Semester.
          </>
        )}
        <br />
        * Kolom No, NISN/NIS, dan Nama Siswa bersifat tetap (frozen).
      </div>
    </div>
  );
};
