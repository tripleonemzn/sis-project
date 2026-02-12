import { FileText } from 'lucide-react';

export const HomeroomReportPage1 = () => {
  return (
    <div className="p-6">
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-4">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">Rapor Halaman 1</h3>
        <p className="mt-2 text-sm text-gray-500">
          Halaman ini berisi konten Rapor Halaman 1 (Identitas & Nilai Akademik).
        </p>
      </div>
    </div>
  );
};
