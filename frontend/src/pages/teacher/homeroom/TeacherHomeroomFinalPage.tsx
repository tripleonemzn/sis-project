import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import type { User } from '../../../types/auth';
import {
  FileText,
  BarChart3,
  Trophy,
  FileBarChart,
  Layers,
  Loader2,
  Filter,
} from 'lucide-react';
import { classService } from '../../../services/class.service';
import { HomeroomLedgerPage } from './HomeroomLedgerPage';
import { HomeroomExtracurricularsPage } from './HomeroomExtracurricularsPage';
import { HomeroomRankingPage } from './HomeroomRankingPage';
import { HomeroomReportSasPage } from './HomeroomReportSasPage';
import { HomeroomReportSatPage } from './HomeroomReportSatPage';
import { HomeroomReportPage2 } from './HomeroomReportPage2';
import { HomeroomReportP5Page } from './HomeroomReportP5Page';

type TabType = 'ledger' | 'extracurriculars' | 'ranking' | 'rapor-1' | 'rapor-2' | 'rapor-p5';
type SemesterType = 'ODD' | 'EVEN';

function normalizeComponentType(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

interface TeacherHomeroomFinalPageProps {
  programCode?: string;
  programBaseType?: string;
  programLabel?: string;
  fixedSemester?: SemesterType | null;
  preferenceScope?: string;
}

function resolveDefaultSemester(
  fixedSemester: SemesterType | null | undefined,
  activeYearName?: string,
): SemesterType {
  if (fixedSemester) return fixedSemester;
  const name = String(activeYearName || '').toUpperCase();
  if (name.includes('GENAP')) return 'EVEN';
  return 'ODD';
}

export const TeacherHomeroomFinalPage = ({
  programCode,
  programBaseType,
  programLabel,
  fixedSemester = null,
  preferenceScope,
}: TeacherHomeroomFinalPageProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('ledger');
  const [semester, setSemester] = useState<SemesterType>('ODD');
  const isSemesterLocked = fixedSemester === 'ODD' || fixedSemester === 'EVEN';
  const resolvedReportType = String(programBaseType || '').toUpperCase();
  const resolvedProgramLabel = String(programLabel || resolvedReportType || 'Rapor').trim();

  const { user: contextUser, activeYear: contextActiveYear } =
    useOutletContext<{ user: User; activeYear: { id: number; name: string } }>() || {};

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const userId = user?.id;
  const queryClient = useQueryClient();

  const preferenceKey = useMemo(() => {
    const scope = String(preferenceScope || programCode || resolvedProgramLabel || 'default')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
    return `teacher-homeroom-final-active-tab-${scope}`;
  }, [preferenceScope, programCode, resolvedProgramLabel]);

  const { data: userData } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => {
      if (!userId) return null;
      return userService.getById(userId);
    },
    enabled: !!userId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<User>) => {
      if (!userId) throw new Error('User ID not found');
      return userService.update(userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    },
  });

  useEffect(() => {
    if (userData?.data?.preferences) {
      const prefs = userData.data.preferences as Record<string, unknown>;
      const savedTab = prefs[preferenceKey];
      if (savedTab && savedTab !== activeTab) {
        setActiveTab(savedTab as TabType);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceKey, userData]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (userId) {
      const currentPrefs = (userData?.data?.preferences || {}) as Record<string, unknown>;
      updateProfileMutation.mutate({
        preferences: { ...currentPrefs, [preferenceKey]: tab },
      });
    }
  };

  const { data: fetchedActiveYear, isLoading: isLoadingYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;

  useEffect(() => {
    const newSemester = resolveDefaultSemester(fixedSemester, activeAcademicYear?.name);
    if (newSemester !== semester) {
      setSemester(newSemester);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedSemester, activeAcademicYear?.name]);

  const { data: classSummary, isLoading: isLoadingClass } = useQuery({
    queryKey: ['homeroom-class-summary', userId, activeAcademicYear?.id],
    queryFn: async () => {
      if (!userId) return null;
      const response = await classService.list({ teacherId: userId, limit: 100 });
      const classes = (response.data?.classes || []) as Array<{ id: number; academicYearId: number }>;
      const activeClass = classes.find(
        (c) => c.academicYearId === activeAcademicYear?.id,
      );
      return activeClass || null;
    },
    enabled: !!userId && user?.role === 'TEACHER' && !!activeAcademicYear?.id,
  });

  const tabs = [
    { id: 'ledger', label: 'Leger Nilai', icon: FileText },
    { id: 'extracurriculars', label: 'Ekstrakurikuler', icon: Layers },
    { id: 'ranking', label: 'Peringkat', icon: Trophy },
    { id: 'rapor-1', label: 'Rapor 1', icon: FileBarChart },
    { id: 'rapor-2', label: 'Rapor 2', icon: FileBarChart },
    { id: 'rapor-p5', label: 'Rapor P5', icon: BarChart3 },
  ];

  if (isLoadingYear || isLoadingClass) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const semesterText = semester === 'EVEN' ? 'Genap' : 'Ganjil';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{`Rapor ${resolvedProgramLabel}`}</h1>
          <p className="text-gray-500 text-sm">
            Kelola rapor akhir semester, leger nilai, dan ekstrakurikuler sesuai Program Ujian aktif.
          </p>
        </div>
      </div>

      {!classSummary ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
          Anda belum ditugaskan sebagai Wali Kelas untuk Tahun Ajaran aktif ini.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
          <div className="border-b border-gray-200 bg-gray-50 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id as TabType)}
                    className={`
                      px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap
                      ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {isSemesterLocked ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 text-sm font-medium">
                <span>Semester {semesterText}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Semester</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Filter className="h-4 w-4 text-gray-500" />
                  </div>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value as SemesterType)}
                    className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <option value="ODD">Semester Ganjil</option>
                    <option value="EVEN">Semester Genap</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            {activeTab === 'ledger' && (
              <HomeroomLedgerPage
                classId={classSummary.id}
                semester={semester}
                reportType={resolvedReportType}
                programCode={programCode}
                reportComponentType={normalizeComponentType(resolvedReportType || 'FINAL')}
              />
            )}
            {activeTab === 'extracurriculars' && (
              <HomeroomExtracurricularsPage
                classId={classSummary.id}
                semester={semester}
                reportType={resolvedReportType}
                programCode={programCode}
              />
            )}
            {activeTab === 'ranking' && (
              <HomeroomRankingPage
                classId={classSummary.id}
                academicYearId={activeAcademicYear?.id || 0}
                semester={semester}
              />
            )}
            {activeTab === 'rapor-1' &&
              (semester === 'EVEN' ? (
                <HomeroomReportSatPage
                  classId={classSummary.id}
                  semester={semester}
                  reportType={resolvedReportType}
                  programCode={programCode}
                  reportLabel={resolvedProgramLabel}
                />
              ) : (
                <HomeroomReportSasPage
                  classId={classSummary.id}
                  semester={semester}
                  reportType={resolvedReportType}
                  programCode={programCode}
                  reportLabel={resolvedProgramLabel}
                />
              ))}
            {activeTab === 'rapor-2' && (
              <HomeroomReportPage2
                classId={classSummary.id}
                semester={semester}
                reportType={resolvedReportType}
                programCode={programCode}
                reportLabel={resolvedProgramLabel}
              />
            )}
            {activeTab === 'rapor-p5' && <HomeroomReportP5Page />}
          </div>
        </div>
      )}
    </div>
  );
};
