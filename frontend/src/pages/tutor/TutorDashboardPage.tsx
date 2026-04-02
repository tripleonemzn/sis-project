import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ClipboardList, Database, Trophy } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { academicYearService } from '../../services/academicYear.service';
import { authService } from '../../services/auth.service';
import { tutorService, type TutorAssignmentSummary } from '../../services/tutor.service';
import { buildTutorMembersHref, getExtracurricularTutorAssignments } from '../../features/tutor/tutorAccess';
import type { User as AuthUser } from '../../types/auth';
import { DashboardWelcomeCard } from '../../components/common/DashboardWelcomeCard';

interface AcademicYear {
  id: number;
  name: string;
  isActive: boolean;
}

interface InventoryOverviewRow {
  assignmentId: number;
  room: { id: number; name: string } | null;
  items: Array<{ id: number; quantity?: number | null }>;
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
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const assignments = (assignmentsData?.data || []) as TutorAssignmentSummary[];
  const extracurricularAssignments = getExtracurricularTutorAssignments(assignments);
  const firstAssignment = extracurricularAssignments[0] || null;

  const { data: inventoryData } = useQuery({
    queryKey: ['tutor-dashboard-inventory', activeAcademicYearId],
    queryFn: () => tutorService.getInventoryOverview(activeAcademicYearId),
    enabled: !!activeAcademicYearId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const inventoryRows = ((inventoryData?.data || []) as InventoryOverviewRow[]) || [];
  const inventoryRoomCount = inventoryRows.filter((row) => row.room?.id).length;
  const inventoryItemCount = inventoryRows.reduce((sum, row) => sum + row.items.length, 0);

  return (
    <div className="space-y-6">
      <DashboardWelcomeCard
        user={user}
        eyebrow="Pembina Ekstrakurikuler"
        subtitle="Berikut adalah ringkasan pengelolaan ekstrakurikuler dan inventaris binaan Anda."
        meta={activeAcademicYear?.name ? `Tahun ajaran aktif: ${activeAcademicYear.name}` : undefined}
        tone="sky"
        className="mt-10"
        fallbackName="Pembina Ekskul"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          to={buildTutorMembersHref(firstAssignment)}
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                <Trophy size={24} />
              </div>
              <div>
                <p className="text-sm text-blue-700/80">Ekstrakurikuler Binaan</p>
                <h3 className="text-2xl font-bold text-blue-900">{extracurricularAssignments.length}</h3>
                <p className="mt-1 text-xs text-blue-700/75">
                  {extracurricularAssignments.length > 0
                    ? 'Kelola anggota dan nilai ekstrakurikuler aktif.'
                    : 'Belum ada penugasan ekskul aktif.'}
                </p>
              </div>
            </div>
          </div>
        </Link>

        <Link
          to="/tutor/inventory"
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-100/80 p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <Database size={24} />
              </div>
              <div>
                <p className="text-sm text-emerald-700/80">Ruang Terkelola</p>
                <h3 className="text-2xl font-bold text-emerald-900">{inventoryRoomCount}</h3>
                <p className="mt-1 text-xs text-emerald-700/75">
                  {inventoryItemCount} item inventaris tercatat.
                </p>
              </div>
            </div>
          </div>
        </Link>

        <Link
          to="/tutor/work-programs?duty=PEMBINA_EKSKUL"
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-100/80 p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <ClipboardList size={24} />
              </div>
              <div>
                <p className="text-sm text-amber-700/80">Program Kerja</p>
                <h3 className="text-2xl font-bold text-amber-900">{extracurricularAssignments.length}</h3>
                <p className="mt-1 text-xs text-amber-700/75">
                  Program kerja pembina ekstrakurikuler siap dikelola.
                </p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                ) : extracurricularAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Belum ada penugasan ekskul aktif</td>
                  </tr>
                ) : (
                  extracurricularAssignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{assignment.ekskul?.name || '-'}</div>
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
                          to={buildTutorMembersHref(assignment)}
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

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
                <BookOpen size={22} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Aksi Cepat</h2>
                <p className="text-sm text-slate-500">Masuk cepat ke fitur yang paling sering dipakai.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <Link to={buildTutorMembersHref(firstAssignment)} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                <span className="flex items-center gap-2"><Trophy size={16} /> Anggota & Nilai</span>
                <span>&rsaquo;</span>
              </Link>
              <Link to="/tutor/work-programs?duty=PEMBINA_EKSKUL" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                <span className="flex items-center gap-2"><ClipboardList size={16} /> Program Kerja</span>
                <span>&rsaquo;</span>
              </Link>
              <Link to="/tutor/inventory" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                <span className="flex items-center gap-2"><Database size={16} /> Kelola Inventaris</span>
                <span>&rsaquo;</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
