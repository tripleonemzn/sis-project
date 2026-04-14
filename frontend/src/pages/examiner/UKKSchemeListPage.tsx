import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../services/academicYear.service';
import { ukkSchemeService } from '../../services/ukkScheme.service';
import { Link } from 'react-router-dom';
import { Loader2, Plus, FileText, Edit } from 'lucide-react';

type UkkSchemeRow = {
  id: number;
  name: string;
  major?: { name?: string | null } | null;
  criteria?: unknown;
};

export const UKKSchemeListPage = () => {
  const { data: academicYearData, isLoading: isLoadingYears } = useQuery({
    queryKey: ['academic-years', 'active'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears = useMemo<AcademicYear[]>(
    () => academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData],
  );
  
  const activeAcademicYear = useMemo(() => {
    if (!academicYears.length) return null;
    return academicYears.find((ay) => ay.isActive) || academicYears[0];
  }, [academicYears]);

  const activeAcademicYearId = activeAcademicYear?.id ?? null;

  const { data: schemesData, isLoading: isLoadingSchemes } = useQuery({
    queryKey: ['ukk-schemes', activeAcademicYearId],
    queryFn: () => ukkSchemeService.getSchemes(activeAcademicYearId || undefined),
    enabled: !!activeAcademicYearId
  });

  const schemes: UkkSchemeRow[] = Array.isArray(schemesData?.data)
    ? schemesData.data
    : Array.isArray(schemesData)
      ? schemesData
      : [];

  if (isLoadingYears || (!!activeAcademicYearId && isLoadingSchemes)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Data Skema Penilaian</h1>
          <p className="text-gray-500 text-sm">
            Kelola skema dan kriteria penilaian UKK untuk tahun ajaran aktif.
          </p>
        </div>
        <div className="flex items-center gap-3">
            <Link 
              to="/examiner/schemes/create" 
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Buat Kriteria
            </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama Skema</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kompetensi Keahlian</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jumlah Kriteria</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schemes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                        <FileText className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="font-medium text-gray-900">Belum ada skema penilaian</p>
                        <p className="text-sm text-gray-500 mt-1">Silakan buat skema penilaian baru untuk mulai.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                schemes.map((scheme) => (
                  <tr key={scheme.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{scheme.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{scheme.major?.name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                        {scheme.criteria ? JSON.parse(JSON.stringify(scheme.criteria)).length : 0} Aspek
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link 
                        to={`/examiner/schemes/${scheme.id}/edit`}
                        className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                        title="Edit Skema"
                      >
                        <Edit size={18} />
                      </Link>
                      <Link 
                        to={`/examiner/ukk-assessment?schemeId=${scheme.id}`}
                        className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                      >
                        Mulai Penilaian
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
