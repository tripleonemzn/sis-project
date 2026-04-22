import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExamScheduleManagementPage from './ExamScheduleManagementPage';
import ExamSittingManagementPage from './ExamSittingManagementPage';
import ExamProctorManagementPage from './ExamProctorManagementPage';
import ExamProgramManagementPage from './ExamProgramManagementPage';
import ExamRoomLayoutManagementPage from './ExamRoomLayoutManagementPage';
import { Calendar, ClipboardList, FolderCog, LayoutPanelTop, School, UserCheck } from 'lucide-react';
import { HeadTuExamCardsPanel } from '../../../components/staff/HeadTuExamCardsPanel';

type ExamHubSection = 'program' | 'jadwal' | 'ruang' | 'mengawas' | 'denah' | 'kartu';

type ExamManagementHubPageProps = {
  title?: string;
  description?: string;
  allowedSections?: ExamHubSection[];
  forcedProgramCode?: string | null;
};

export default function ExamManagementHubPage({
  title = 'Kelola Ujian',
  description = 'Pengelolaan Jadwal, Ruang, Mengawas, Kartu Ujian, dan Program Ujian dalam satu halaman.',
  allowedSections,
  forcedProgramCode,
}: ExamManagementHubPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = (searchParams.get('section') || 'program') as ExamHubSection;

  const setActive = useCallback((next: ExamHubSection) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const items = useMemo(() => ([
    { id: 'program', label: 'Program Ujian', icon: FolderCog },
    { id: 'jadwal', label: 'Jadwal Ujian', icon: Calendar },
    { id: 'ruang', label: 'Ruang Ujian', icon: School },
    { id: 'mengawas', label: 'Jadwal Mengawas', icon: UserCheck },
    { id: 'denah', label: 'Generate Denah Ruang', icon: LayoutPanelTop },
    { id: 'kartu', label: 'Kartu Ujian', icon: ClipboardList },
  ]), []) as Array<{ id: ExamHubSection; label: string; icon: typeof FolderCog }>;

  const visibleItems = useMemo(() => {
    if (!Array.isArray(allowedSections) || allowedSections.length === 0) {
      return items;
    }
    const allowedSet = new Set(allowedSections);
    return items.filter((item) => allowedSet.has(item.id));
  }, [allowedSections, items]);

  const active = useMemo<ExamHubSection>(() => {
    if (visibleItems.some((item) => item.id === requestedSection)) {
      return requestedSection;
    }
    return visibleItems[0]?.id || 'program';
  }, [requestedSection, visibleItems]);

  useEffect(() => {
    if (visibleItems.length === 0) return;
    const currentSection = (searchParams.get('section') || 'program') as ExamHubSection;
    if (currentSection === active) return;
    const params = new URLSearchParams(searchParams);
    params.set('section', active);
    setSearchParams(params, { replace: true });
  }, [active, searchParams, setSearchParams, visibleItems]);

  return (
    <div className="space-y-6 w-full pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-500">{description}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        {visibleItems.length > 0 ? (
          <div className="border-b border-gray-200 mb-4">
            <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
              {visibleItems.map((item) => {
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
        ) : null}

        <div key={active} className="pt-1">
          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">
              Workspace ini belum memiliki feature grant aktif.
            </div>
          ) : active === 'jadwal' ? (
            <ExamScheduleManagementPage forcedProgramCode={forcedProgramCode} />
          ) : active === 'ruang' ? (
            <ExamSittingManagementPage forcedProgramCode={forcedProgramCode} />
          ) : active === 'denah' ? (
            <ExamRoomLayoutManagementPage forcedProgramCode={forcedProgramCode} />
          ) : active === 'mengawas' ? (
            <ExamProctorManagementPage forcedProgramCode={forcedProgramCode} />
          ) : active === 'kartu' ? (
            <HeadTuExamCardsPanel ownerMode="CURRICULUM" forcedProgramCode={forcedProgramCode} />
          ) : (
            <ExamProgramManagementPage />
          )}
        </div>
      </div>
    </div>
  );
}
