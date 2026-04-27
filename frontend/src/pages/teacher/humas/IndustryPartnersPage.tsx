import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Info, Users } from 'lucide-react';
import { PartnersTab } from './components/PartnersTab';
import { VacanciesTab } from './components/VacanciesTab';
import { ApplicationsTab } from './components/ApplicationsTab';

export const IndustryPartnersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'partners' | 'bkk' | 'applications') || 'partners';

  const setActiveTab = (tab: 'partners' | 'bkk' | 'applications') => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', tab);
      return newParams;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mitra Industri & BKK</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kelola data mitra industri dan informasi Bursa Kerja Khusus (BKK)
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveTab('partners')}
            className={`
              inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
              ${activeTab === 'partners'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
            `}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>Mitra Industri</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('bkk')}
            className={`
              inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
              ${activeTab === 'bkk'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
            `}
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
                  <span>Lowongan BKK</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('applications')}
            className={`
              inline-flex items-center px-4 py-3 border-b-2 whitespace-nowrap text-sm transition-colors
              ${activeTab === 'applications'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
            `}
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              <span>Lamaran Masuk</span>
            </div>
          </button>
        </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[400px] p-6">
        {activeTab === 'partners' ? <PartnersTab /> : activeTab === 'applications' ? <ApplicationsTab /> : <VacanciesTab />}
      </div>
    </div>
  );
};
