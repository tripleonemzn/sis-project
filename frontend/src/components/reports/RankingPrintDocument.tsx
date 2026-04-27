import React from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface RankingPrintDocumentProps {
  className: string;
  academicYear: string;
  semester: string;
  rankings: {
    rank: number;
    totalScore: number;
    averageScore: number;
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
  }[];
  principalName: string;
  homeroomTeacherName: string;
  titimangsa: Date;
}

const formatScoreDisplay = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return parsed.toFixed(2);
};

export const RankingPrintDocument: React.FC<RankingPrintDocumentProps> = ({
  className,
  academicYear,
  semester,
  rankings,
  principalName,
  homeroomTeacherName,
  titimangsa,
}) => {
  return (
    <div className="bg-white p-6 w-full max-w-[21cm] mx-auto text-black">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 12px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }
          .print-header { margin-bottom: 8mm; text-align: center; }
          .print-header h1 { font-size: 12px; line-height: 1.2; margin: 0; }
          .print-header h2 { font-size: 12px; line-height: 1.2; margin: 0; }
          .print-header h3 { font-size: 12px; line-height: 1.2; margin: 0; }
          .footer { margin-top: 16px; page-break-inside: avoid; }
          .signature-row { display: flex; justify-content: space-between; align-items: flex-start; }
          .signature-box { text-align: center; width: 250px; font-size: 12px; }
          .signature-box u { font-size: 12px; font-weight: 700; }
          .signature-space { height: 70px; }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
          }
          th, td {
            border: 1px solid black;
            padding: 3px 4px;
            text-align: center;
            line-height: 1.1;
          }
          th {
            background-color: #f3f4f6 !important;
            font-weight: 600;
          }
          .text-left { text-align: left !important; }
          .font-bold { font-weight: 700 !important; }
          .bg-gold { background-color: #FEF3C7 !important; }
          .bg-silver { background-color: #F3F4F6 !important; }
          .bg-bronze { background-color: #FFEDD5 !important; }
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          border: 1px solid black;
          padding: 6px;
          text-align: center;
        }
        .print-header { text-align: center; }
        .text-left { text-align: left; }
        .signature-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .signature-box { text-align: center; width: 250px; font-size: 12px; }
        .signature-box u { font-size: 12px; font-weight: 700; }
        .signature-space { height: 70px; }
      `}</style>

      <div className="text-center mb-4 uppercase font-bold leading-tight print-header">
        <h1 className="text-base">DAFTAR PERINGKAT</h1>
        <h2 className="text-sm">KELAS {className}</h2>
        <h3 className="text-sm">TAHUN AJARAN {academicYear} - SEMESTER {semester === 'ODD' ? 'GANJIL' : 'GENAP'}</h3>
      </div>

      <table className="w-full mb-8">
        <thead>
          <tr className="bg-gray-100">
            <th className="w-10">No</th>
            <th className="w-28">NISN</th>
            <th className="text-left">Nama</th>
            <th className="w-20">Jumlah Nilai</th>
            <th className="w-20">Rata-rata</th>
            <th className="w-36">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((student, index) => {
            let rowClass = '';
            const rankLabel = `Peringkat ${student.rank}`;
            
            // Visuals for Top 3
            if (student.rank === 1) rowClass = 'bg-yellow-50 print:bg-gold';
            else if (student.rank === 2) rowClass = 'bg-gray-50 print:bg-silver';
            else if (student.rank === 3) rowClass = 'bg-orange-50 print:bg-bronze';

            return (
              <tr key={student.student.id} className={rowClass}>
                <td>{index + 1}</td>
                <td>{student.student.nisn || student.student.nis || '-'}</td>
                <td className="text-left font-medium">{student.student.name}</td>
                <td>{formatScoreDisplay(student.totalScore)}</td>
                <td>{formatScoreDisplay(student.averageScore)}</td>
                <td className="font-medium">{rankLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="footer">
        <div className="signature-row">
          <div className="signature-box">
            Mengetahui,<br />
            Kepala SMKS Karya Guna Bhakti 2
            <div className="signature-space"></div>
            <u>{principalName}</u>
          </div>
          <div className="signature-box">
            Bekasi, {format(titimangsa, 'd MMMM yyyy', { locale: id })}<br />
            Wali Kelas
            <div className="signature-space"></div>
            <u>{homeroomTeacherName}</u>
          </div>
        </div>
      </div>
    </div>
  );
};
