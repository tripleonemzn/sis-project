import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Trophy, GraduationCap, Users, BarChart3, BookOpenText } from 'lucide-react';
import { ExtracurricularPage } from '../../admin/extracurriculars/ExtracurricularPage';
import { StudentManagementPage } from '../../admin/users/StudentManagementPage';
import { UserList } from '../../admin/users/UserList';
import { AttendanceRecapPage } from '../../admin/academic/AttendanceRecapPage';
import { academicYearService } from '../../../services/academicYear.service';
import HomeroomBookPanel from '../../../components/homeroom/HomeroomBookPanel';

export default function StudentManagementHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('section') || 'ekskul';
  const activeYearQuery = useQuery({
    queryKey: ['wakasis-student-management-active-year'],
    queryFn: async () => {
      const response = await academicYearService.getActive();
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const setActive = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const items = useMemo(() => ([
    { id: 'ekskul', label: 'Ekstrakurikuler', icon: Trophy },
    { id: 'siswa', label: 'Kelola Siswa', icon: GraduationCap },
    { id: 'ortu', label: 'Kelola Orang Tua', icon: Users },
    { id: 'pembina', label: 'Kelola Tutor Eksternal', icon: Users },
    { id: 'absensi', label: 'Rekap Absensi', icon: BarChart3 },
    { id: 'buku-wali-kelas', label: 'Buku Wali Kelas', icon: BookOpenText },
  ]), []);

  return (
    <div className="space-y-6 w-full pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kelola Kesiswaan</h1>
        <p className="text-gray-500">
          Akses ekstrakurikuler, data siswa, orang tua, tutor eksternal, dan rekap absensi.
          Penugasan guru aktif sebagai pembina dikelola dari menu Ekstrakurikuler, termasuk monitoring Buku Wali Kelas secara read only.
        </p>
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
            {active === 'ekskul' ? (
              <ExtracurricularPage />
            ) : active === 'siswa' ? (
              <StudentManagementPage />
            ) : active === 'ortu' ? (
              <UserList 
                fixedRole="PARENT" 
                title="Kelola Orang Tua" 
                description="Kelola akun orang tua / wali siswa" 
              />
            ) : active === 'pembina' ? (
              <UserList 
                fixedRole="EXTRACURRICULAR_TUTOR" 
                title="Kelola Tutor Eksternal" 
                description="Kelola akun tutor eksternal atau pembina non-guru. Guru aktif sebagai pembina dikelola dari menu Ekstrakurikuler."
              />
            ) : active === 'buku-wali-kelas' ? (
              <HomeroomBookPanel
                mode="student_affairs"
                academicYearId={activeYearQuery.data?.id}
              />
            ) : (
              <AttendanceRecapPage />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
