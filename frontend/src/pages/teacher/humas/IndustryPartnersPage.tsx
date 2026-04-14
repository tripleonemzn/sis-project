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
        <h1 className="text-page-title font-bold text-gray-900">Mitra Industri & BKK</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kelola data mitra industri dan informasi Bursa Kerja Khusus (BKK)
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
          <button
            onClick={() => setActiveTab('partners')}
            className={`
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === 'partners'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
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
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === 'bkk'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
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
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === 'applications'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              <span>Lamaran Masuk</span>
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[400px] p-6">
        {activeTab === 'partners' ? <PartnersTab /> : activeTab === 'applications' ? <ApplicationsTab /> : <VacanciesTab />}
      </div>
    </div>
  );
};
