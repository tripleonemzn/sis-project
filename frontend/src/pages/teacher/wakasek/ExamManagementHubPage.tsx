import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExamScheduleManagementPage from './ExamScheduleManagementPage';
import ExamSittingManagementPage from './ExamSittingManagementPage';
import ExamProctorManagementPage from './ExamProctorManagementPage';
import ExamProgramManagementPage from './ExamProgramManagementPage';
import { Calendar, FolderCog, School, UserCheck } from 'lucide-react';

export default function ExamManagementHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('section') || 'jadwal';

  const setActive = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const items = useMemo(() => ([
    { id: 'jadwal', label: 'Jadwal Ujian', icon: Calendar },
    { id: 'ruang', label: 'Ruang Ujian', icon: School },
    { id: 'mengawas', label: 'Jadwal Mengawas', icon: UserCheck },
    { id: 'program', label: 'Program Ujian', icon: FolderCog },
  ]), []);

  return (
    <div className="space-y-6 w-full pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kelola Ujian</h1>
        <p className="text-gray-500">Pengelolaan Jadwal, Ruang, Mengawas, dan Program Ujian dalam satu halaman.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 p-2">
            <div className="space-y-1">
              {items.map(item => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-lg ${
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 p-4 lg:p-6">
            {active === 'jadwal' ? (
              <ExamScheduleManagementPage />
            ) : active === 'ruang' ? (
              <ExamSittingManagementPage />
            ) : active === 'mengawas' ? (
              <ExamProctorManagementPage />
            ) : (
              <ExamProgramManagementPage />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
