import { useQuery } from '@tanstack/react-query';
import { tutorService } from '../../services/tutor.service';
import { academicYearService } from '../../services/academicYear.service';
import { authService } from '../../services/auth.service';
import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { User as AuthUser } from '../../types/auth';

interface AcademicYear {
  id: number;
  name: string;
  isActive: boolean;
}

interface TutorAssignment {
  id: number;
  isActive: boolean;
  ekskul: {
    id: number;
    name: string;
  };
}

export const TutorDashboardPage = () => {
  const { user: contextUser } = useOutletContext<{ user?: AuthUser | null }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const { data: academicYearData } = useQuery({
    queryKey: ['academic-years', 'active'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const activeAcademicYear = useMemo(() => {
    const list = (academicYearData?.data?.academicYears || academicYearData?.academicYears || []) as AcademicYear[];
    return list.find((ay) => ay.isActive) || list[0];
  }, [academicYearData]);

  const activeAcademicYearId = activeAcademicYear?.id;

  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: ['tutor-assignments', activeAcademicYearId],
    queryFn: () => tutorService.getAssignments(activeAcademicYearId),
    enabled: !!activeAcademicYearId,
  });

  const assignments = (assignmentsData?.data || []) as TutorAssignment[];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard Pembina</h1>
        <p className="text-gray-600">Selamat datang, {user?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link
          to="/tutor/members"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
        <div className="p-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-700">
              <Trophy size={24} />
            </div>
            <div>
              <p className="text-sm text-blue-700/80">Ekstrakurikuler</p>
              <h3 className="text-2xl font-bold text-blue-900">{assignments.length}</h3>
            </div>
          </div>
        </div>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Daftar Ekstrakurikuler Binaan</h2>
          <p className="text-sm text-gray-500">Tahun Ajaran {activeAcademicYear?.name}</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ekstrakurikuler</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading...</td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Belum ada penugasan</td>
                </tr>
              ) : (
                assignments.map((assignment) => (
                  <tr key={assignment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{assignment.ekskul.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        assignment.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {assignment.isActive ? 'Aktif' : 'Non-Aktif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        to={`/tutor/members?ekskulId=${assignment.ekskul.id}`}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                      >
                        Kelola Anggota & Nilai
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
