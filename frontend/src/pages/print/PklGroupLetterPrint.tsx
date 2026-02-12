import React from 'react';
import PrintLayout from './PrintLayout';

const PklGroupLetterPrint: React.FC = () => {
  const [printData, setPrintData] = React.useState<any>(null);

  React.useEffect(() => {
    // 1. Try to get from window property (passed by window.open)
    const windowData = (window as any).printData;
    
    // 2. Try to get from localStorage (fallback)
    const savedData = localStorage.getItem('pkl_group_print_data');
    const sessionData = savedData ? JSON.parse(savedData) : null;
    
    const finalData = windowData || sessionData;
    if (finalData) {
      setPrintData(finalData);
      
      // Clear storage after reading to keep it clean
      localStorage.removeItem('pkl_group_print_data');
    }
  }, []);

  React.useEffect(() => {
    if (printData && printData.html) {
      console.log("Group print data received, attempting auto-print...");
      const timer = setTimeout(() => {
        try {
          console.log("Executing auto-print group...");
          window.focus();
          window.print();
        } catch (err) {
          console.error("Group print error:", err);
        }
      }, 800); // Reduced from 1.5s to 800ms for faster response
      return () => clearTimeout(timer);
    }
  }, [printData]);

  if (!printData || !printData.html) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Data Cetak Tidak Ditemukan</h1>
        <p className="text-gray-500 mt-2">Silakan kembali ke dashboard dan coba cetak lagi.</p>
      </div>
    );
  }

  return (
    <PrintLayout title="Cetak Surat PKL (Kolektif)">
      <div 
        className="print-content"
        dangerouslySetInnerHTML={{ __html: printData.html }} 
      />
      
      <div className="no-print fixed bottom-8 right-8 z-[99999]">
        <button 
          type="button"
          onClick={() => {
            window.focus();
            window.print();
          }}
          className="bg-blue-600 text-white px-8 py-4 rounded-xl shadow-2xl hover:bg-blue-700 transition-all flex items-center gap-2 font-black uppercase tracking-wider active:scale-95 cursor-pointer border-2 border-white/20"
        >
          Cetak Sekarang
        </button>
      </div>
    </PrintLayout>
  );
};

export default PklGroupLetterPrint;
