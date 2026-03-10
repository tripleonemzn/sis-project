import React from 'react';

interface SchoolApprovalPrintDocumentProps {
  internship: {
    academicYear?: { name?: string | null } | null;
    student?: { studentClass?: { name?: string | null } | null } | null;
    examiner?: { name?: string | null; nuptk?: string | null } | null;
    officials?: {
      activeAcademicYear?: { name?: string | null } | null;
      headOfMajor?: { name?: string | null; nuptk?: string | null } | null;
      wakasekHumas?: { name?: string | null; nuptk?: string | null } | null;
      principal?: { name?: string | null; nuptk?: string | null } | null;
    } | null;
  };
  title: string;
  customDate: string;
}

export const SchoolApprovalPrintDocument: React.FC<SchoolApprovalPrintDocumentProps> = ({
  internship,
  title,
  customDate,
}) => {
  const { officials } = internship;
  const activeYearName = officials?.activeAcademicYear?.name || new Date().getFullYear().toString();

  // Logic for Promoted Year (XI -> +1)
  const getPromotedYear = (baseYear?: string | null, className?: string | null) => {
    if (!baseYear) return baseYear;
    const isXI = className && className.trim().toUpperCase().startsWith('XI') && !className.trim().toUpperCase().startsWith('XII');
    if (isXI) {
       const parts = baseYear.split('/');
       if (parts.length === 2) {
         const start = parseInt(parts[0]);
         const end = parseInt(parts[1]);
         if (!isNaN(start) && !isNaN(end)) {
           return `${start + 1}/${end + 1}`;
         }
       }
    }
    return baseYear;
  };

  const promotedYearName = getPromotedYear(internship.academicYear?.name, internship.student?.studentClass?.name);

  return (
    <div className="bg-white text-black p-8 mx-auto shadow-sm" style={{ 
      width: '210mm', 
      minHeight: '297mm', 
      padding: '2cm 2cm 2cm 3cm', // Standard margins
      fontFamily: '"Times New Roman", Times, serif',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      <style>{`
        @media print {
          @page { margin: 0; size: A4; }
          body { 
            margin: 0; 
            padding: 0; 
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .school-approval-sheet { width: 100% !important; margin: 0 !important; padding: 2cm 2cm 2cm 3cm !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="text-center font-bold text-lg mb-6" style={{ lineHeight: '1.5' }}>
        <div className="text-xl mb-1">LEMBAR PENGESAHAN SEKOLAH</div>
        <div className="mb-1">LAPORAN PRAKTIK KERJA LAPANGAN</div>
        <div>Tahun Ajaran {activeYearName}</div>
      </div>

      <div className="text-center font-bold text-lg mb-8" style={{ lineHeight: '1.5' }}>
        <div className="mb-2 uppercase">{title}</div>
        <div>Diajukan Sebagai Salah Satu Syarat Kelulusan</div>
        <div>Tahun Ajaran {promotedYearName}</div>
      </div>

      <div className="mb-8 font-serif text-lg">
        <div className="flex items-center gap-2 justify-center">
          <span>Pada Tanggal:</span>
          <span className="border-b border-black px-2 min-w-[12rem] text-center inline-block">
            {customDate || '... ... ...'}
          </span>
        </div>
      </div>

      <div className="text-center font-bold text-lg mb-12">
        Mengesahkan:
      </div>

      {/* Signatories Grid */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-24 text-center font-serif">
        {/* Row 1 */}
        <div>
          <div className="font-bold mb-20">Kepala Bidang Keahlian</div>
          <div className="font-bold underline">{officials?.headOfMajor?.name || '.........................'}</div>
          <div>NUPTK. {officials?.headOfMajor?.nuptk || '-'}</div>
        </div>
        <div>
          <div className="font-bold mb-20">Penguji Sidang</div>
          <div className="font-bold underline">{internship.examiner?.name || '.........................'}</div>
          <div>NUPTK. {internship.examiner?.nuptk || '-'}</div>
        </div>

        {/* Row 2 */}
        <div>
           <div className="font-bold mb-20">Wakil Kepala Sekolah<br/>Bidang Hubungan Industri</div>
           <div className="font-bold underline">{officials?.wakasekHumas?.name || '.........................'}</div>
           <div>NUPTK. {officials?.wakasekHumas?.nuptk || '-'}</div>
        </div>
        <div>
           <div className="font-bold mb-20">Kepala SMKS Karya Guna Bhakti 2</div>
           <div className="font-bold underline">{officials?.principal?.name || '.........................'}</div>
           <div>NUPTK. {officials?.principal?.nuptk || '-'}</div>
        </div>
      </div>
    </div>
  );
};
