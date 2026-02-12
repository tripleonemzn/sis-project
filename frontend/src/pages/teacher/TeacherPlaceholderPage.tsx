import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

const TeacherPlaceholderPage = () => {
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const pageName = pathParts[pathParts.length - 1]
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="bg-blue-50 p-6 rounded-full mb-6">
        <Construction size={64} className="text-blue-600" />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">{pageName}</h1>
      <p className="text-gray-600 max-w-md mx-auto mb-8">
        Halaman ini sedang dalam tahap pengembangan. Fitur untuk <strong>{pageName}</strong> akan segera tersedia.
      </p>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-lg text-left">
        <h3 className="text-sm font-semibold text-yellow-800 mb-2">Informasi Teknis</h3>
        <p className="text-xs text-yellow-700 font-mono">
          Path: {location.pathname}
        </p>
      </div>
    </div>
  );
};

export default TeacherPlaceholderPage;
