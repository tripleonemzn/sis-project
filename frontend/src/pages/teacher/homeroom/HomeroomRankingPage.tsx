import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService } from '../../../services/report.service';
import { Loader2, Printer, Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { RankingPrintDocument } from '../../../components/reports/RankingPrintDocument';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';

interface HomeroomRankingPageProps {
  classId: number;
  academicYearId: number;
  semester: 'ODD' | 'EVEN';
}

type RankingStudentRow = {
  rank: number;
  totalScore: number;
  averageScore: number;
  predicate?: string;
  student: {
    id: number;
    name: string;
    nisn?: string;
    nis?: string;
  };
};

const formatScoreDisplay = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return parsed.toFixed(2);
};

export const HomeroomRankingPage = ({ classId, academicYearId, semester }: HomeroomRankingPageProps) => {
  const [titimangsa, setTitimangsa] = useState<Date>(new Date());
  const [isPrinting, setIsPrinting] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const [iframeBody, setIframeBody] = useState<HTMLElement | null>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ['class-rankings', classId, academicYearId, semester],
    queryFn: () => reportService.getClassRankings({ classId, academicYearId, semester }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const handlePrint = () => {
    if (!printFrameRef.current?.contentWindow) return;
    
    setIsPrinting(true);
    
    // Allow time for render
    setTimeout(() => {
        printFrameRef.current?.contentWindow?.print();
        setIsPrinting(false);
    }, 500);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-4">
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Titimangsa</label>
                <div className="relative">
                    <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="date" 
                        value={format(titimangsa, 'yyyy-MM-dd')}
                        onChange={(e) => setTitimangsa(new Date(e.target.value))}
                        className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>
            
            <button 
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 h-[38px] mt-[1.3rem]"
            >
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>Cetak Peringkat</span>
            </button>
        </div>
      </div>

      {/* Preview Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-4 w-16 text-center">No</th>
                        <th className="px-6 py-4 w-40">NISN/NIS</th>
                        <th className="px-6 py-4">Nama Siswa</th>
                        <th className="px-6 py-4 text-center">Jumlah Nilai</th>
                        <th className="px-6 py-4 text-center">Rata-rata</th>
                        <th className="px-6 py-4 text-center">Keterangan</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {data.rankings.map((student: RankingStudentRow, index: number) => {
                         let rowClass = 'hover:bg-gray-50';
                         let badgeClass = 'bg-gray-100 text-gray-700';
                         
                         if (student.rank === 1) {
                             rowClass = 'bg-yellow-50/50 hover:bg-yellow-50';
                             badgeClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';
                         } else if (student.rank === 2) {
                             rowClass = 'bg-gray-50/50 hover:bg-gray-50';
                             badgeClass = 'bg-gray-200 text-gray-800 border border-gray-300';
                         } else if (student.rank === 3) {
                             rowClass = 'bg-orange-50/50 hover:bg-orange-50';
                             badgeClass = 'bg-orange-100 text-orange-800 border border-orange-200';
                         }

                        return (
                            <tr key={student.student.id} className={rowClass}>
                                <td className="px-6 py-4 text-center text-gray-500">{index + 1}</td>
                                <td className="px-6 py-4 font-mono text-gray-600">
                                    {student.student.nisn || student.student.nis || '-'}
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900">{student.student.name}</td>
                                <td className="px-6 py-4 text-center font-medium">{formatScoreDisplay(student.totalScore)}</td>
                                <td className="px-6 py-4 text-center font-medium">{formatScoreDisplay(student.averageScore)}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
                                        {student.rank <= 3 && <Trophy className="w-3 h-3 mr-1" />}
                                        Peringkat {student.rank}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </div>

      {/* Hidden Print Iframe */}
      <iframe 
        ref={printFrameRef}
        onLoad={() => setIframeBody(printFrameRef.current?.contentDocument?.body ?? null)}
        className="fixed opacity-0 pointer-events-none"
        title="Print Frame"
        style={{ width: '0px', height: '0px', position: 'absolute', left: '-9999px' }}
      />

      {/* Portal Content */}
      {iframeBody && createPortal(
        <RankingPrintDocument 
            className={data.className}
            academicYear={data.academicYear}
            semester={data.semester}
            rankings={data.rankings}
            principalName={data.principalName}
            homeroomTeacherName={data.homeroomTeacher?.name || '-'}
            titimangsa={titimangsa}
        />,
        iframeBody
      )}
    </div>
  );
};
