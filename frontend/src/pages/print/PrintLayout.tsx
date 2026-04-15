import React, { useEffect } from 'react';

interface PrintLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const PrintLayout: React.FC<PrintLayoutProps> = ({ children, title = 'Cetak Dokumen' }) => {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="print-root">
      {/* 
        PENTING: index.css memiliki aturan 'body * { visibility: hidden !important }' 
        dan hanya '.print-only' yang diberi 'visibility: visible'. 
        Itulah sebabnya print dialog selalu blank putih.
      */}
      <div className="print-sheet-container">
        <div className="print-sheet">
          {children}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm;
          }

          /* Paksa body putih dan terlihat */
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            visibility: visible !important;
          }
          
          /* Container untuk sheet */
          .print-sheet-container {
            visibility: visible !important;
            display: block !important;
            position: static !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-sheet {
            visibility: visible !important;
            display: block !important;
            position: static !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }

          /* Sembunyikan semua elemen non-print */
          .no-print {
            display: none !important;
          }
          
          /* Sembunyikan elemen lain yang mungkin mengganggu dari index.css */
          body * {
            visibility: hidden !important;
          }
          
          .print-sheet-container, 
          .print-sheet-container *,
          .print-root,
          .print-root * {
            visibility: visible !important;
          }
        }

        @media screen {
          body {
            background-color: #525659 !important;
            margin: 0;
            padding: 0;
          }
          .print-sheet-container {
            padding: 100px 0 40px 0; /* Extra top padding for the fixed header */
            min-height: 100vh;
            position: relative;
            z-index: 1;
          }
          .print-sheet {
            background: white;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 20mm;
            box-shadow: 0 0 20px rgba(0,0,0,0.3);
            box-sizing: border-box;
            color: black;
            display: block;
          }
        }
      `}} />
    </div>
  );
};

export default PrintLayout;
