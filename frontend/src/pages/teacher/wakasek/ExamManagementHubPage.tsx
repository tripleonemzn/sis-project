import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExamScheduleManagementPage from './ExamScheduleManagementPage';
import ExamSittingManagementPage from './ExamSittingManagementPage';
import ExamProctorManagementPage from './ExamProctorManagementPage';
import ExamProgramManagementPage from './ExamProgramManagementPage';
import { Calendar, FolderCog, School, UserCheck } from 'lucide-react';

export default function ExamManagementHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('section') || 'program';

  const setActive = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const items = useMemo(() => ([
    { id: 'program', label: 'Program Ujian', icon: FolderCog },
    { id: 'jadwal', label: 'Jadwal Ujian', icon: Calendar },
    { id: 'ruang', label: 'Ruang Ujian', icon: School },
    { id: 'mengawas', label: 'Jadwal Mengawas', icon: UserCheck },
  ]), []);

  return (
    <div className="space-y-6 w-full pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kelola Ujian</h1>
        <p className="text-gray-500">Pengelolaan Jadwal, Ruang, Mengawas, dan Program Ujian dalam satu halaman.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="border-b border-gray-200 mb-4">
          <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors text-[13px] ${
                    isActive
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-1">
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
  );
}
