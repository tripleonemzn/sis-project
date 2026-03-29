import { useQuery } from '@tanstack/react-query';
import { tutorService, type TutorAssignmentSummary } from '../../services/tutor.service';
import { academicYearService } from '../../services/academicYear.service';
import { authService } from '../../services/auth.service';
import { useMemo } from 'react';
import { BookOpen, Boxes, ClipboardList, Database, Trophy, Users, Vote } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { User as AuthUser } from '../../types/auth';
import { osisService } from '../../services/osis.service';
import {
  buildTutorMembersHref,
  getExtracurricularTutorAssignments,
  getOsisTutorAssignments,
} from '../../features/tutor/tutorAccess';

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
  });

  const assignments = (assignmentsData?.data || []) as TutorAssignmentSummary[];
  const extracurricularAssignments = getExtracurricularTutorAssignments(assignments);
  const osisAssignments = getOsisTutorAssignments(assignments);
  const hasOsisAssignment = osisAssignments.length > 0;
  const firstAssignment = extracurricularAssignments[0] || null;
  const primaryWorkProgramPath =
    extracurricularAssignments.length > 0
      ? '/tutor/work-programs?duty=PEMBINA_EKSKUL'
      : hasOsisAssignment
      ? '/tutor/work-programs?duty=PEMBINA_OSIS'
      : '/tutor/work-programs?duty=PEMBINA_EKSKUL';
  const primaryWorkProgramCount =
    extracurricularAssignments.length > 0 ? extracurricularAssignments.length : osisAssignments.length;
  const primaryWorkProgramSubtitle =
    extracurricularAssignments.length > 0
      ? 'Ekstrakurikuler aktif siap dikelola.'
      : hasOsisAssignment
      ? 'Program kerja OSIS siap dikelola.'
      : 'Belum ada assignment aktif.';

  const { data: inventoryData } = useQuery({
    queryKey: ['tutor-dashboard-inventory', activeAcademicYearId],
    queryFn: () => tutorService.getInventoryOverview(activeAcademicYearId),
    enabled: !!activeAcademicYearId,
  });

  const { data: osisPeriodsData } = useQuery({
    queryKey: ['tutor-dashboard-osis-periods', activeAcademicYearId],
    queryFn: () => osisService.getPeriods({ academicYearId: activeAcademicYearId || undefined }),
    enabled: !!activeAcademicYearId && hasOsisAssignment,
  });

  const inventoryRows = ((inventoryData?.data || []) as InventoryOverviewRow[]) || [];
  const inventoryRoomCount = inventoryRows.filter((row) => row.room?.id).length;
  const inventoryItemCount = inventoryRows.reduce((sum, row) => sum + row.items.length, 0);
  const osisPeriods = (osisPeriodsData?.data || []) || [];
  const activeOsisPeriods = osisPeriods.filter((period) => period.status === 'PUBLISHED').length;
  const osisCandidateCount = osisPeriods.reduce(
    (sum, period) => sum + Number(period.candidates?.length || 0),
    0,
  );
  const tutorInitial = String(user?.name || 'P').trim().charAt(0).toUpperCase() || 'P';
  const isOsisTutor = hasOsisAssignment;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-emerald-50 px-6 py-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-cyan-100 text-5xl font-bold text-cyan-800 shadow-sm">
              {tutorInitial}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Selamat Datang, {user?.name || 'Pembina Ekskul'}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Ringkasan pengelolaan ekstrakurikuler{isOsisTutor ? ' dan Pembina OSIS' : ''} pada tahun ajaran aktif.
              </p>
              {activeAcademicYear?.name ? (
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Tahun ajaran aktif: {activeAcademicYear.name}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <p className="mt-1 text-xs text-blue-700/75">Kelola anggota dan nilai ekstrakurikuler.</p>
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
                <p className="mt-1 text-xs text-emerald-700/75">{inventoryItemCount} item inventaris tercatat.</p>
              </div>
            </div>
          </div>
        </Link>

        <Link
          to={primaryWorkProgramPath}
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-100/80 p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <ClipboardList size={24} />
              </div>
              <div>
                <p className="text-sm text-amber-700/80">Program Kerja</p>
                <h3 className="text-2xl font-bold text-amber-900">{primaryWorkProgramCount}</h3>
                <p className="mt-1 text-xs text-amber-700/75">{primaryWorkProgramSubtitle}</p>
              </div>
            </div>
          </div>
        </Link>

        <Link
          to={isOsisTutor ? '/tutor/osis/election' : buildTutorMembersHref(firstAssignment)}
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-100/80 p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                <Vote size={24} />
              </div>
              <div>
                <p className="text-sm text-violet-700/80">Pemilihan OSIS</p>
                <h3 className="text-2xl font-bold text-violet-900">{isOsisTutor ? activeOsisPeriods : 0}</h3>
                <p className="mt-1 text-xs text-violet-700/75">
                  {isOsisTutor ? `${osisCandidateCount} calon tercatat di seluruh periode.` : 'Aktif bila pembina memiliki penugasan OSIS.'}
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
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Belum ada penugasan</td>
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
                <h2 className="text-lg font-semibold text-slate-900">Akses Cepat</h2>
                <p className="text-sm text-slate-500">Masuk cepat ke fitur yang paling sering dipakai.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <Link to={buildTutorMembersHref(firstAssignment)} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                <span className="flex items-center gap-2"><Trophy size={16} /> Anggota & Nilai</span>
                <span>&rsaquo;</span>
              </Link>
              <Link to={primaryWorkProgramPath} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                <span className="flex items-center gap-2"><ClipboardList size={16} /> Program Kerja</span>
                <span>&rsaquo;</span>
              </Link>
              <Link to="/tutor/inventory" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                <span className="flex items-center gap-2"><Boxes size={16} /> Inventaris Ekskul</span>
                <span>&rsaquo;</span>
              </Link>
              {isOsisTutor ? (
                <Link to="/tutor/work-programs?duty=PEMBINA_OSIS" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                  <span className="flex items-center gap-2"><ClipboardList size={16} /> Program Kerja OSIS</span>
                  <span>&rsaquo;</span>
                </Link>
              ) : null}
              {isOsisTutor ? (
                <Link to="/tutor/osis/members" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                  <span className="flex items-center gap-2"><Users size={16} /> Struktur & Nilai OSIS</span>
                  <span>&rsaquo;</span>
                </Link>
              ) : null}
              {isOsisTutor ? (
                <Link to="/tutor/osis/election" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50">
                  <span className="flex items-center gap-2"><Vote size={16} /> Pemilihan OSIS</span>
                  <span>&rsaquo;</span>
                </Link>
              ) : null}
            </div>
          </div>

          {isOsisTutor ? (
            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                  <Vote size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Status Pemilihan OSIS</h2>
                  <p className="text-sm text-slate-500">Ringkasan singkat pemilihan ketua OSIS.</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-violet-100 bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-500">Periode Aktif</p>
                  <p className="mt-1 text-2xl font-bold text-violet-900">{activeOsisPeriods}</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-500">Total Calon</p>
                  <p className="mt-1 text-2xl font-bold text-violet-900">{osisCandidateCount}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
