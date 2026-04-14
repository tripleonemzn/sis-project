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
} from 'lucide-react';
import { AcademicCalendarPage } from '../../admin/academic/AcademicCalendarPage';
import { SchedulePage } from '../../admin/academic/SchedulePage';
import { TeachingLoadSummaryPage } from '../../admin/academic/TeachingLoadSummaryPage';
import { KkmPage } from '../../admin/academic/KkmPage';
import { SubjectCategoryPage } from '../../admin/master/SubjectCategoryPage';
import { SubjectPage } from '../../admin/master/SubjectPage';
import { TeacherAssignmentPage } from '../../admin/users/TeacherAssignmentPage';

export default function CurriculumManagementHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const validSections = useMemo(
    () => ['kategori', 'mapel', 'kkm', 'assignment', 'kalender', 'jadwal', 'rekap'],
    [],
  );
  const requestedSection = searchParams.get('section') || 'kategori';
  const active = validSections.includes(requestedSection) ? requestedSection : 'kategori';

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
    ],
    [],
  );

  return (
    <div className="space-y-6 w-full pb-20">
      <div>
        <h1 className="text-page-title font-bold text-gray-900">Kelola Kurikulum</h1>
        <p className="text-gray-500">Akses Kategori Mapel, Mata Pelajaran, Data KKM, Assignment Guru, Kalender Akademik, Jadwal Pelajaran, dan Rekap Jam Mengajar.</p>
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
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors text-sm ${
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

        <div key={active} className="pt-1">
          {active === 'kategori' ? (
            <SubjectCategoryPage />
          ) : active === 'mapel' ? (
            <SubjectPage />
          ) : active === 'kkm' ? (
            <KkmPage />
          ) : active === 'assignment' ? (
            <TeacherAssignmentPage scope="CURRICULUM" />
          ) : active === 'kalender' ? (
            <AcademicCalendarPage />
          ) : active === 'jadwal' ? (
            <SchedulePage scope="CURRICULUM" />
          ) : (
            <TeachingLoadSummaryPage scope="CURRICULUM" />
          )}
        </div>
      </div>
    </div>
  );
}
