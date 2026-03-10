import { useQuery } from '@tanstack/react-query';
import { useOutletContext, Link } from 'react-router-dom';
import { Loader2, ClipboardList, BookOpen, Calendar } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import { ukkSchemeService } from '../../services/ukkScheme.service';
import type { User as UserType } from '../../types/auth';

type ExaminerSchemeLite = {
  id: number;
  name: string;
  subjectId?: number | null;
  subject?: {
    name?: string;
    category?: {
      code?: string | null;
    } | null;
  } | null;
  major?: { name?: string } | null;
};

export const ExaminerDashboard = () => {
  const { user: contextUser, activeYear: contextActiveYear } =
    useOutletContext<{ user?: UserType; activeYear?: { id: number; name: string } | null }>() || {};

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });

  const apiUser = authData?.data;
  const user = (contextUser as UserType) || (apiUser as UserType) || ({} as UserType);

  const { data: fetchedActiveYear, isLoading: isLoadingYears } = useActiveAcademicYear();
  const activeAcademicYear = contextActiveYear || fetchedActiveYear;
  const activeAcademicYearId = activeAcademicYear?.id;

  const { data: schemesData, isLoading: isLoadingSchemes } = useQuery({
    queryKey: ['ukk-schemes', activeAcademicYearId],
    queryFn: () => ukkSchemeService.getSchemes(activeAcademicYearId),
    enabled: Boolean(activeAcademicYearId),
  });

  const schemes = ((schemesData?.data || schemesData || []) as ExaminerSchemeLite[]) || [];
  const subjectCount = new Set(
    schemes
      .map((item) => item.subjectId)
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item)),
  ).size;

  if (isLoadingYears || (!!activeAcademicYearId && isLoadingSchemes)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-orange-50 to-amber-100/80 rounded-2xl px-6 py-4 shadow-sm border border-orange-100 mt-10 relative flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="-mt-16 relative">
            <div
              className="w-36 h-36 rounded-full p-1 bg-white/90 ring-1 ring-orange-200"
              style={{
                boxShadow:
                  'inset 6px 6px 12px rgba(0,0,0,0.06), inset -6px -6px 12px rgba(255,255,255,0.9), 8px 8px 16px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.7)',
              }}
            >
              {user.photo ? (
                <img
                  src={
                    user.photo.startsWith('/api') || user.photo.startsWith('http')
                      ? user.photo
                      : `/api/uploads/${user.photo}`
                  }
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-6xl">
                  {String(user.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Selamat Datang, {user.name}! 👋</h1>
            <p className="text-gray-500 text-sm">
              Dashboard ini khusus untuk pengelolaan skema dan penilaian UKK.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/examiner/schemes"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
        <div className="p-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-700">
              <ClipboardList size={24} />
            </div>
            <div>
              <p className="text-sm text-blue-700/80 font-medium">Total Skema UKK</p>
              <h3 className="text-2xl font-bold text-blue-900">{schemes.length}</h3>
            </div>
          </div>
        </div>
        </Link>

        <Link
          to="/examiner/schemes"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
        <div className="p-6 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-teal-100 rounded-lg text-teal-700">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-teal-700/80 font-medium">Mapel Tercakup</p>
              <h3 className="text-2xl font-bold text-teal-900">{subjectCount}</h3>
            </div>
          </div>
        </div>
        </Link>

        <Link
          to="/examiner/schemes"
          className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
        <div className="p-6 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg text-orange-700">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-sm text-orange-700/80 font-medium">Tahun Ajaran Aktif</p>
              <h3 className="text-lg font-bold text-orange-900">{activeAcademicYear?.name || '-'}</h3>
            </div>
          </div>
        </div>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Skema Penilaian Terbaru</h2>
            <p className="text-xs text-gray-500 mt-0.5">Daftar skema UKK pada tahun ajaran aktif.</p>
          </div>
          <Link to="/examiner/schemes" className="text-blue-600 text-xs font-medium hover:underline">
            Lihat Semua
          </Link>
        </div>
        <div className="px-5 py-4 space-y-3">
          {schemes.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Belum ada skema penilaian.</p>
          ) : (
            schemes.slice(0, 5).map((scheme) => (
              <div key={scheme.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="text-sm font-medium text-gray-900 truncate">{scheme.name}</div>
                  <div className="text-xs text-gray-500">
                    {scheme.subject?.category?.code === 'UMUM'
                      ? `Kompetensi ${scheme.major?.name || 'UKK'}`
                      : `${scheme.subject?.name || '-'} • ${scheme.major?.name || '-'}`}
                  </div>
                </div>
                <div className="text-right">
                  <Link
                    to={`/examiner/ukk-assessment?schemeId=${scheme.id}`}
                    className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                  >
                    Mulai Penilaian
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
