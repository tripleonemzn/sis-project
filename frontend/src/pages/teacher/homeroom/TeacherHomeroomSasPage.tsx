import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { 
  FileText, 
  BarChart3, 
  Trophy, 
  FileBarChart,
  Layers,
  Loader2
} from 'lucide-react';
import { classService } from '../../../services/class.service';
import { HomeroomLedgerPage } from './HomeroomLedgerPage';
import { HomeroomExtracurricularsPage } from './HomeroomExtracurricularsPage';
import { HomeroomRankingPage } from './HomeroomRankingPage';
import { HomeroomReportSasPage } from './HomeroomReportSasPage';
import { HomeroomReportPage2 } from './HomeroomReportPage2';
import { HomeroomReportP5Page } from './HomeroomReportP5Page';

type TabType = 'ledger' | 'extracurriculars' | 'ranking' | 'rapor-1' | 'rapor-2' | 'rapor-p5';

export const TeacherHomeroomSasPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('ledger');
  
  // SAS is typically Semester Ganjil (ODD)
  const semester = 'ODD';

  const { user: contextUser, activeYear: contextActiveYear } = useOutletContext<{ user: any, activeYear: any }>() || {};

  // 1. Get Current User
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Fetch User Profile for Preferences
  const { data: userData } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => {
      if (!userId) return null;
      return userService.getById(userId);
    },
    enabled: !!userId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => {
      if (!userId) throw new Error('User ID not found');
      return userService.update(userId, data);
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    }
  });

  useEffect(() => {
    if (userData?.data?.preferences) {
        // @ts-ignore
        const savedTab = userData.data.preferences['teacher-homeroom-sas-active-tab'];
        if (savedTab) {
            setActiveTab(savedTab as TabType);
        }
    }
  }, [userData]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (userId) {
        // @ts-ignore
        const currentPrefs = userData?.data?.preferences || {};
        updateProfileMutation.mutate({
            preferences: { ...currentPrefs, 'teacher-homeroom-sas-active-tab': tab }
        });
    }
  };

  // 2. Get Active Academic Year
  const { data: fetchedActiveYear, isLoading: isLoadingYear } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;

  // 3. Get Homeroom Class Summary (Filtered by Active Year)
  const { data: classSummary, isLoading: isLoadingClass } = useQuery({
    queryKey: ['homeroom-class-summary', userId, activeAcademicYear?.id],
    queryFn: async () => {
      if (!userId) return null;
      const response = await classService.list({ teacherId: userId, limit: 100 });
      const activeClass = response.data.classes.find((c: any) => c.academicYearId === activeAcademicYear?.id);
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapor SAS</h1>
          <p className="text-gray-500 text-sm">
            Kelola rapor Sumatif Akhir Semester (Ganjil), leger nilai, dan ekstrakurikuler
          </p>
        </div>
      </div>

      {!classSummary ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
          Anda belum ditugaskan sebagai Wali Kelas untuk Tahun Ajaran aktif ini.
        </div>
      ) : (
        /* Main Content Card */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
          {/* Tabs Header */}
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
                      ${isActive 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
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

            {/* Fixed Semester Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 text-sm font-medium">
              <span>Semester {semester === 'ODD' ? 'Ganjil' : 'Genap'}</span>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'ledger' && (
              <HomeroomLedgerPage 
                classId={classSummary.id} 
                semester={semester}
                reportType="SAS"
              />
            )}
            
            {activeTab === 'extracurriculars' && (
              <HomeroomExtracurricularsPage
                classId={classSummary.id}
                semester={semester}
              />
            )}

            {activeTab === 'ranking' && (
              <HomeroomRankingPage
                classId={classSummary.id}
                academicYearId={activeAcademicYear?.id || 0}
                semester={semester}
              />
            )}

            {activeTab === 'rapor-1' && (
              <HomeroomReportSasPage 
                classId={classSummary.id} 
                semester="ODD" 
              />
            )}
            {activeTab === 'rapor-2' && (
              <HomeroomReportPage2 
                classId={classSummary.id} 
                semester={semester} 
              />
            )}
            {activeTab === 'rapor-p5' && <HomeroomReportP5Page />}
          </div>
        </div>
      )}
    </div>
  );
};
