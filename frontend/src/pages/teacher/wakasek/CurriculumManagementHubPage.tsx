import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarRange,
  Clock,
  BarChart3,
  Percent,
  Layers,
  BookOpen,
  Users,
  History,
} from 'lucide-react';
import { AcademicCalendarPage } from '../../admin/academic/AcademicCalendarPage';
import { SchedulePage } from '../../admin/academic/SchedulePage';
import { TeachingLoadSummaryPage } from '../../admin/academic/TeachingLoadSummaryPage';
import { KkmPage } from '../../admin/academic/KkmPage';
import { SubjectCategoryPage } from '../../admin/master/SubjectCategoryPage';
import { SubjectPage } from '../../admin/master/SubjectPage';
import { TeacherAssignmentPage } from '../../admin/users/TeacherAssignmentPage';
import { AuditLogPage } from '../../admin/audit/AuditLogPage';

export default function CurriculumManagementHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('section') || 'kategori';

  const setActive = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const items = useMemo(
    () => [
      { id: 'kategori', label: 'Kategori Mapel', icon: Layers },
      { id: 'mapel', label: 'Mata Pelajaran', icon: BookOpen },
      { id: 'kkm', label: 'Data KKM', icon: Percent },
      { id: 'assignment', label: 'Assignment Guru', icon: Users },
      { id: 'kalender', label: 'Kalender Akademik', icon: CalendarRange },
      { id: 'jadwal', label: 'Jadwal Pelajaran', icon: Clock },
      { id: 'rekap', label: 'Rekap Jam Mengajar', icon: BarChart3 },
      { id: 'audit', label: 'Riwayat Audit', icon: History },
    ],
    [],
  );

  return (
    <div className="space-y-6 w-full pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kelola Kurikulum</h1>
        <p className="text-gray-500">Akses Kategori Mapel, Mata Pelajaran, Data KKM, Assignment Guru, Kalender Akademik, Jadwal Pelajaran, dan Rekap Jam Mengajar.</p>
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
            {active === 'kategori' ? (
              <SubjectCategoryPage />
            ) : active === 'mapel' ? (
              <SubjectPage />
            ) : active === 'kkm' ? (
              <KkmPage />
            ) : active === 'assignment' ? (
              <TeacherAssignmentPage />
            ) : active === 'kalender' ? (
              <AcademicCalendarPage />
            ) : active === 'jadwal' ? (
              <SchedulePage />
            ) : active === 'audit' ? (
              <AuditLogPage />
            ) : (
              <TeachingLoadSummaryPage />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
