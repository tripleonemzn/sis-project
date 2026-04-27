import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService } from '../../../services/report.service';
import { Loader2, Printer, Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

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

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const HomeroomRankingPage = ({ classId, academicYearId, semester }: HomeroomRankingPageProps) => {
  const [titimangsa, setTitimangsa] = useState<Date>(new Date());
  const [isPrinting, setIsPrinting] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['class-rankings', classId, academicYearId, semester],
    queryFn: () => reportService.getClassRankings({ classId, academicYearId, semester }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const printReport = () => {
    if (!data || isPrinting) return;

    const iframe = printIframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      console.error('Print iframe not found');
      return;
    }

    setIsPrinting(true);

    const rowsHtml = data.rankings
      .map((student: RankingStudentRow, index: number) => {
        let rowStyle = '';
        if (student.rank === 1) rowStyle = 'background-color: #fef3c7;';
        else if (student.rank === 2) rowStyle = 'background-color: #f3f4f6;';
        else if (student.rank === 3) rowStyle = 'background-color: #ffedd5;';

        return `
          <tr style="${rowStyle}">
            <td>${index + 1}</td>
            <td>${escapeHtml(student.student.nisn || student.student.nis || '-')}</td>
            <td class="text-left">${escapeHtml(student.student.name)}</td>
            <td>${escapeHtml(formatScoreDisplay(student.totalScore))}</td>
            <td>${escapeHtml(formatScoreDisplay(student.averageScore))}</td>
            <td>${escapeHtml(`Peringkat ${student.rank}`)}</td>
          </tr>
        `;
      })
      .join('');

    const titimangsaLabel = format(titimangsa, 'd MMMM yyyy', { locale: id });
    const semesterLabel = semester === 'ODD' ? 'GANJIL' : 'GENAP';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Peringkat</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: white;
              color: black;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12px;
              line-height: 1.25;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              padding: 0;
            }
            .page {
              width: 100%;
            }
            .header {
              text-align: center;
              margin-bottom: 14px;
              text-transform: uppercase;
              font-weight: 700;
              line-height: 1.3;
            }
            .header .title {
              font-size: 14px;
            }
            .header .subtitle {
              font-size: 13px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              font-size: 10px;
            }
            th, td {
              border: 1px solid #000;
              padding: 4px 5px;
              text-align: center;
              vertical-align: middle;
              line-height: 1.2;
            }
            th {
              background: #f3f4f6;
              font-weight: 700;
            }
            .text-left {
              text-align: left;
            }
            .signature-row {
              margin-top: 18px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 24px;
            }
            .signature-box {
              width: 240px;
              text-align: center;
              font-size: 12px;
            }
            .signature-space {
              height: 72px;
            }
            .signature-name {
              font-weight: 700;
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="title">DAFTAR PERINGKAT</div>
              <div class="subtitle">KELAS ${escapeHtml(data.className)}</div>
              <div class="subtitle">TAHUN AJARAN ${escapeHtml(data.academicYear)} - SEMESTER ${semesterLabel}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 7%;">No</th>
                  <th style="width: 18%;">NISN/NIS</th>
                  <th>Nama</th>
                  <th style="width: 17%;">Jumlah Nilai</th>
                  <th style="width: 14%;">Rata-rata</th>
                  <th style="width: 18%;">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="signature-row">
              <div class="signature-box">
                Mengetahui,<br />
                Kepala SMKS Karya Guna Bhakti 2
                <div class="signature-space"></div>
                <div class="signature-name">${escapeHtml(data.principalName || '-')}</div>
              </div>
              <div class="signature-box">
                Bekasi, ${escapeHtml(titimangsaLabel)}<br />
                Wali Kelas
                <div class="signature-space"></div>
                <div class="signature-name">${escapeHtml(data.homeroomTeacher?.name || '-')}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(html);
    printDoc.close();

    const cleanup = () => {
      setIsPrinting(false);
      try {
        iframe.contentWindow?.removeEventListener('afterprint', cleanup);
      } catch {
        // no-op
      }
    };

    try {
      iframe.contentWindow.addEventListener('afterprint', cleanup);
    } catch {
      // no-op
    }

    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(cleanup, 1200);
    }, 350);
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Titimangsa</label>
            <div className="relative">
              <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={format(titimangsa, 'yyyy-MM-dd')}
                onChange={(event) => setTitimangsa(new Date(event.target.value))}
                className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <button
            onClick={printReport}
            disabled={isPrinting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 h-[38px] mt-[1.3rem]"
          >
            {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            <span>Cetak Peringkat</span>
          </button>
        </div>
      </div>

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
                        {student.rank <= 3 ? <Trophy className="w-3 h-3 mr-1" /> : null}
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

      <iframe ref={printIframeRef} title="ranking-print-frame" className="hidden" />
    </div>
  );
};
