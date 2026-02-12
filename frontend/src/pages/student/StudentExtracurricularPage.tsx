import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { academicYearService } from '../../services/academicYear.service';
import { Loader2, Trophy, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Extracurricular {
  id: number;
  name: string;
  description?: string | null;
  tutorAssignments?: { tutor?: { name: string } }[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ListResponse {
  extracurriculars: Extracurricular[];
  pagination: Pagination;
}

interface Enrollment {
  id: number;
  ekskulId: number;
  academicYearId: number;
  ekskul: { id: number; name: string };
}

export const StudentExtracurricularPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [agree, setAgree] = useState(false);

  const { data: activeYear } = useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      const res = await academicYearService.getActive();
      return res.data;
    }
  });

  const { data: myEnrollmentRes, isLoading: loadingMyEnrollment } = useQuery<Enrollment | null>({
    queryKey: ['my-extracurricular-enrollment'],
    queryFn: async () => {
      const res = await api.get('/student/extracurriculars/my');
      return res.data.data;
    }
  });
  const myEnrollment = myEnrollmentRes || null;

  const { data: listRes, isLoading: loadingList } = useQuery<ListResponse>({
    queryKey: ['public-extracurriculars', page, limit, search],
    queryFn: async () => {
      const res = await api.get('/public/extracurriculars', {
        params: { page, limit, search: search.trim() || undefined }
      });
      return res.data.data;
    }
  });

  const enrollMutation = useMutation({
    mutationFn: async (ekskulId: number) => {
      await api.post('/student/extracurriculars/enroll', {
        ekskulId,
        academicYearId: activeYear?.id
      });
    },
    onSuccess: () => {
      toast.success('Pendaftaran ekstrakurikuler berhasil');
      setAgree(false);
      setSearch('');
      queryClient.invalidateQueries({ queryKey: ['my-extracurricular-enrollment'] });
      queryClient.invalidateQueries({ queryKey: ['public-extracurriculars'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Gagal mendaftar ekstrakurikuler';
      toast.error(msg);
    }
  });

  const pagination = listRes?.pagination;
  const items = listRes?.extracurriculars || [];

  const showingRange = useMemo(() => {
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, pagination?.total || 0);
    return { start, end, total: pagination?.total || 0 };
  }, [page, limit, pagination]);

  useEffect(() => {
    if (page > (pagination?.totalPages || 1)) {
      setPage(1);
    }
  }, [pagination, page]);

  if (loadingMyEnrollment || loadingList) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ekstrakurikuler</h1>
          <p className="text-gray-500 text-sm">Pilih satu ekstrakurikuler untuk tahun ajaran aktif</p>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5" />
        <div className="text-sm">
          Pilihan ekstrakurikuler hanya berlaku satu kali untuk tahun ajaran aktif. Untuk pindah ekskul, ajukan ke Wakasek Kesiswaan. Setelah disetujui dan dikonfirmasi oleh Pembina ekskul baru, barulah perpindahan diproses.
        </div>
      </div>

      {myEnrollment ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pilihan Saat Ini</h2>
              <p className="text-sm text-gray-500">Anda sudah memilih ekstrakurikuler</p>
            </div>
          </div>
          <div className="px-6 py-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-blue-600" />
              <div>
                <div className="text-lg font-bold text-gray-900">{myEnrollment.ekskul.name}</div>
                <div className="text-xs text-gray-500">Terkunci untuk Tahun Ajaran {activeYear?.name}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Cari ekstrakurikuler..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="block w-full pl-3 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="limit" className="text-sm text-gray-600">
                  Tampilkan:
                </label>
                <select
                  id="limit"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={35}>35</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            {items.length === 0 ? (
              <div className="text-center text-gray-500 py-12">Tidak ada data ekstrakurikuler</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-start gap-3">
                      <Trophy className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-600">
                          {item.tutorAssignments && item.tutorAssignments.length > 0
                            ? `Pembina: ${item.tutorAssignments.map((t) => t.tutor?.name).filter(Boolean).join(', ')}`
                            : 'Pembina: -'}
                        </div>
                        {item.description && (
                          <div className="text-sm text-gray-700 mt-1">{item.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          id={`agree-${item.id}`}
                          type="checkbox"
                          checked={agree}
                          onChange={(e) => setAgree(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`agree-${item.id}`} className="text-sm text-gray-700">
                          Saya memahami bahwa pilihan ini hanya berlaku satu kali
                        </label>
                      </div>
                      <button
                        disabled={!agree || enrollMutation.isPending}
                        onClick={() => enrollMutation.mutate(item.id)}
                        className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          !agree || enrollMutation.isPending
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        Pilih Ekstrakurikuler
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              Menampilkan {showingRange.start}-{Math.max(showingRange.start, showingRange.end)} dari {showingRange.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`px-3 py-1.5 rounded-lg border ${
                  page <= 1 ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min((pagination?.totalPages || 1), p + 1))}
                disabled={page >= (pagination?.totalPages || 1)}
                className={`px-3 py-1.5 rounded-lg border ${
                  page >= (pagination?.totalPages || 1)
                    ? 'border-gray-200 text-gray-400'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
