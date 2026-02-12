import React from 'react';

// --- Types ---
export interface AnalysisItem {
  id: string;
  competency: string;
  material: string;
  tp: string;
  profiles: string[];
}

export interface AnalysisRow {
  id: string;
  element: string;
  cpText: string;
  items: AnalysisItem[];
}

export interface CpAnalysisDocumentProps {
  academicYearName: string;
  subjectName: string;
  level: string;
  program: string;
  principalName: string;
  teacherName: string;
  titimangsa: string;
  rows: AnalysisRow[];
}

export const CpAnalysisDocument: React.FC<CpAnalysisDocumentProps> = ({
  academicYearName,
  subjectName,
  level,
  program,
  principalName,
  teacherName,
  titimangsa,
  rows
}) => {
  return (
    <div className="bg-white p-10 w-[29.7cm] text-black print:w-full print:p-0 mx-auto">
      <style>{`
        @media print {
          /* CRITICAL: Override global styles that hide everything */
          body, body * {
            visibility: visible !important;
          }
          
          /* Hide non-print elements explicitly if needed */
          .no-print {
            display: none !important;
          }

          @page {
            size: landscape;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            background: white !important;
          }
          /* Ensure table borders are black and visible */
          table, th, td {
            border: 1px solid black !important;
            border-collapse: collapse !important;
          }
        }
      `}</style>
      
      {/* Header */}
      <div className="text-center mb-6 font-bold uppercase leading-relaxed">
        <h1 className="text-base">Analisis Capaian Pembelajaran</h1>
        <h2 className="text-base">SMKS Karya Guna Bhakti 2</h2>
        <h3 className="text-base">Tahun Ajaran {academicYearName}</h3>
      </div>

      <div className="mb-6 text-sm grid grid-cols-[160px_10px_1fr] gap-y-1">
         <div>Mata Pelajaran</div><div>:</div><div>{subjectName}</div>
         <div>Tingkat</div><div>:</div><div>{level}</div>
         <div>Program Keahlian</div><div>:</div><div>{program}</div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse border border-black text-[11px]">
        <thead>
          <tr className="bg-white">
            <th className="border border-black p-2 w-[15%]">ELEMEN</th>
            <th className="border border-black p-2 w-[25%]">CAPAIAN PEMBELAJARAN</th>
            <th className="border border-black p-2 w-[10%]">KOMPETENSI</th>
            <th className="border border-black p-2 w-[15%]">KONTEN/MATERI</th>
            <th className="border border-black p-2 w-[20%]">TUJUAN PEMBELAJARAN</th>
            <th className="border border-black p-2 w-[15%]">DIMENSI PROFIL LULUSAN</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="border border-black p-8 text-center italic text-gray-400">
                Belum ada data.
              </td>
            </tr>
          ) : (
            rows.flatMap((row) => {
              if (row.items.length === 0) {
                return (
                  <tr key={row.id}>
                    <td className="border border-black p-2 align-top font-medium">{row.element}</td>
                    <td className="border border-black p-2 align-top text-justify">{row.cpText}</td>
                    <td className="border border-black p-2 bg-gray-50"></td>
                    <td className="border border-black p-2 bg-gray-50"></td>
                    <td className="border border-black p-2 bg-gray-50"></td>
                    <td className="border border-black p-2 bg-gray-50"></td>
                  </tr>
                );
              }
              return row.items.map((item, idx) => (
                <tr key={item.id}>
                  {idx === 0 && (
                    <>
                      <td className="border border-black p-2 align-top font-medium" rowSpan={row.items.length}>
                        {row.element}
                      </td>
                      <td className="border border-black p-2 align-top text-justify" rowSpan={row.items.length}>
                        {row.cpText}
                      </td>
                    </>
                  )}
                  <td className="border border-black p-2 align-top">{item.competency}</td>
                  <td className="border border-black p-2 align-top">{item.material}</td>
                  <td className="border border-black p-2 align-top">{item.tp}</td>
                  <td className="border border-black p-2 align-top">{item.profiles.join(', ')}</td>
                </tr>
              ));
            })
          )}
        </tbody>
      </table>

      {/* Footer */}
      <div className="mt-12 flex justify-between text-sm break-inside-avoid">
         <div className="text-center">
            <p className="mb-20">Kepala SMKS Karya Guna Bhakti 2</p>
            <p className="underline font-bold">{principalName}</p>
         </div>
         <div className="text-center">
            <p className="mb-20">Bekasi, {titimangsa}<br/>Guru Mata Pelajaran</p>
            <p className="underline font-bold">{teacherName}</p>
         </div>
      </div>
    </div>
  );
};
