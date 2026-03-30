import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trophy, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { academicYearService } from '../../services/academicYear.service';
import api from '../../services/api';
import {
  osisService,
  type StudentOsisStatusPayload,
} from '../../services/osis.service';

interface Extracurricular {
  id: number;
  name: string;
  description?: string | null;
  category?: 'EXTRACURRICULAR' | 'OSIS';
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

function formatShortDate(raw?: string | null) {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export const StudentExtracurricularPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [selectedAgreeItemId, setSelectedAgreeItemId] = useState<number | null>(null);

  const { data: activeYear } = useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      const res = await academicYearService.getActive();
      return res.data;
    },
  });

  const { data: myEnrollmentRes, isLoading: loadingMyEnrollment } = useQuery<Enrollment | null>({
    queryKey: ['my-extracurricular-enrollment'],
    queryFn: async () => {
      const res = await api.get('/student/extracurriculars/my');
      return res.data.data;
    },
  });
  const myEnrollment = myEnrollmentRes || null;

  const { data: myOsisStatus, isLoading: loadingMyOsisStatus } = useQuery<StudentOsisStatusPayload | null>({
    queryKey: ['my-osis-status'],
    queryFn: async () => {
      const res = await osisService.getStudentStatus();
      return res.data;
    },
  });

  const { data: listRes, isLoading: loadingList } = useQuery<ListResponse>({
    queryKey: ['public-extracurriculars', page, limit, search],
    queryFn: async () => {
      const res = await api.get('/public/extracurriculars', {
        params: {
          page,
          limit,
          search: search.trim() || undefined,
        },
      });
      return res.data.data;
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (ekskulId: number) => {
      await api.post('/student/extracurriculars/enroll', {
        ekskulId,
        academicYearId: activeYear?.id,
      });
    },
    onSuccess: async () => {
      toast.success('Pendaftaran ekstrakurikuler berhasil');
      setSelectedAgreeItemId(null);
      setSearch('');
      await queryClient.invalidateQueries({ queryKey: ['my-extracurricular-enrollment'] });
      await queryClient.invalidateQueries({ queryKey: ['public-extracurriculars'] });
    },
    onError: (err: unknown) => {
      const normalized = err as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        normalized.response?.data?.message ||
        normalized.message ||
        'Gagal mendaftar ekstrakurikuler';
      toast.error(msg);
    },
  });

  const osisJoinMutation = useMutation({
    mutationFn: async (ekskulId: number) =>
      osisService.createStudentJoinRequest({
        ekskulId,
        academicYearId: activeYear?.id,
      }),
    onSuccess: async () => {
      toast.success('Pengajuan OSIS berhasil dikirim');
      setSelectedAgreeItemId(null);
      setSearch('');
      await queryClient.invalidateQueries({ queryKey: ['my-osis-status'] });
      await queryClient.invalidateQueries({ queryKey: ['public-extracurriculars'] });
    },
    onError: (err: unknown) => {
      const normalized = err as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        normalized.response?.data?.message ||
        normalized.message ||
        'Gagal mengirim pengajuan OSIS';
      toast.error(msg);
    },
  });

  const pagination = listRes?.pagination;
  const items = listRes?.extracurriculars || [];
  const selectedItem = items.find((item) => item.id === selectedAgreeItemId) || null;
  const selectedIsOsis = selectedItem?.category === 'OSIS';
  const osisMembership = myOsisStatus?.membership || null;
  const osisRequest = myOsisStatus?.request || null;
  const hasPendingOsisRequest = osisRequest?.status === 'PENDING';

  const showingRange = useMemo(() => {
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, pagination?.total || 0);
    return { start, end, total: pagination?.total || 0 };
  }, [page, limit, pagination]);

  const canSubmitSelectedItem = Boolean(
    selectedItem &&
      selectedAgreeItemId === selectedItem.id &&
      (selectedIsOsis ? !osisMembership && !hasPendingOsisRequest : !myEnrollment),
  );

  const submitButtonLabel = useMemo(() => {
    if (!selectedItem) return 'Pilih Data Terlebih Dahulu';
    if (selectedIsOsis) {
      if (osisMembership) return 'Sudah Menjadi Anggota OSIS';
      if (hasPendingOsisRequest) return 'Pengajuan OSIS Sedang Diproses';
      return osisJoinMutation.isPending ? 'Mengirim Pengajuan OSIS...' : 'Ajukan OSIS';
    }
    if (myEnrollment) return 'Ekskul Reguler Sudah Dipilih';
    return enrollMutation.isPending ? 'Memproses...' : 'Pilih Ekstrakurikuler';
  }, [
    enrollMutation.isPending,
    hasPendingOsisRequest,
    myEnrollment,
    osisJoinMutation.isPending,
    osisMembership,
    selectedIsOsis,
    selectedItem,
  ]);

  const handleSubmit = () => {
    if (!selectedItem) return;
    if (selectedItem.category === 'OSIS') {
      osisJoinMutation.mutate(selectedItem.id);
      return;
    }
    enrollMutation.mutate(selectedItem.id);
  };

  if (loadingMyEnrollment || loadingMyOsisStatus || loadingList) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ekstrakurikuler & OSIS</h1>
          <p className="text-sm text-gray-500">
            Pilih 1 ekstrakurikuler reguler dan ajukan OSIS secara terpisah pada tahun ajaran aktif.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
        <AlertTriangle className="mt-0.5 h-5 w-5" />
        <div className="text-sm">
          Anda tetap hanya boleh memilih <span className="font-semibold">1 ekstrakurikuler reguler</span>.
          OSIS diperlakukan sebagai organisasi siswa, sehingga pengajuannya tidak mengunci slot ekskul reguler dan akan
          diproses oleh pembina OSIS ke divisi serta jabatan yang sesuai.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Status Ekskul Reguler</h2>
              <p className="text-sm text-gray-500">Pilihan ekskul reguler Anda pada tahun ajaran aktif.</p>
            </div>
          </div>
          <div className="px-6 py-6">
            {myEnrollment ? (
              <div className="flex items-center gap-3">
                <Trophy className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-lg font-bold text-gray-900">{myEnrollment.ekskul.name}</div>
                  <div className="text-xs text-gray-500">Terkunci untuk Tahun Ajaran {activeYear?.name}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-amber-700">Anda belum memilih ekskul reguler.</div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Status OSIS</h2>
              <p className="text-sm text-gray-500">Pengajuan atau keanggotaan OSIS Anda pada tahun ajaran aktif.</p>
            </div>
          </div>
          <div className="space-y-3 px-6 py-6">
            {osisMembership ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <div className="text-sm font-semibold text-emerald-800">Sudah Menjadi Anggota OSIS</div>
                <div className="mt-1 text-lg font-bold text-emerald-900">
                  {osisMembership.position?.name || 'Pengurus OSIS'}
                </div>
                <div className="mt-1 text-sm text-emerald-800">
                  Divisi: {osisMembership.division?.name || osisMembership.position?.division?.name || '-'}
                </div>
              </div>
            ) : osisRequest ? (
              <div
                className={`rounded-xl border px-4 py-4 ${
                  osisRequest.status === 'PENDING'
                    ? 'border-amber-200 bg-amber-50'
                    : osisRequest.status === 'REJECTED'
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">
                  {osisRequest.status === 'PENDING'
                    ? 'Pengajuan OSIS Menunggu Proses'
                    : osisRequest.status === 'REJECTED'
                      ? 'Pengajuan OSIS Ditolak'
                      : 'Riwayat Pengajuan OSIS'}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {osisRequest.ekskul?.name || 'OSIS'} • Diajukan {formatShortDate(osisRequest.requestedAt)}
                </div>
                {osisRequest.note ? (
                  <div className="mt-2 text-xs text-slate-600">Catatan pembina: {osisRequest.note}</div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-amber-700">
                Anda belum mengajukan OSIS. Jika dipilih, pembina OSIS akan menempatkan Anda ke divisi dan jabatan yang sesuai.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Cari ekstrakurikuler atau OSIS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm leading-5 placeholder-gray-500 transition duration-150 ease-in-out focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-28"
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
            <div className="py-12 text-center text-gray-500">Tidak ada data ekstrakurikuler / OSIS</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const isOsis = item.category === 'OSIS';
                const isSelected = selectedAgreeItemId === item.id;
                const isItemLocked = isOsis ? Boolean(osisMembership || hasPendingOsisRequest) : Boolean(myEnrollment);

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      isSelected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isOsis ? (
                        <Users className="mt-0.5 h-5 w-5 text-amber-600" />
                      ) : (
                        <Trophy className="mt-0.5 h-5 w-5 text-blue-600" />
                      )}
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-gray-900">{item.name}</div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              isOsis ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {isOsis ? 'Organisasi OSIS' : 'Ekskul Reguler'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {item.tutorAssignments && item.tutorAssignments.length > 0
                            ? `Pembina: ${item.tutorAssignments
                                .map((t) => t.tutor?.name)
                                .filter(Boolean)
                                .join(', ')}`
                            : 'Pembina: -'}
                        </div>
                        {item.description ? (
                          <div className="mt-1 text-sm text-gray-700">{item.description}</div>
                        ) : null}
                        {isOsis ? (
                          <div className="mt-2 text-xs text-amber-700">
                            Jika diajukan, pembina OSIS akan menempatkan Anda ke divisi dan jabatan yang sesuai.
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-start gap-2">
                        <input
                          id={`agree-${item.id}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => setSelectedAgreeItemId(e.target.checked ? item.id : null)}
                          className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`agree-${item.id}`} className="text-sm text-gray-700">
                          {isOsis
                            ? 'Saya memahami pengajuan OSIS akan diproses pembina sebelum saya ditempatkan ke struktur organisasi.'
                            : 'Saya memahami pilihan ekskul reguler hanya berlaku satu kali untuk tahun ajaran aktif.'}
                        </label>
                      </div>
                      {isItemLocked ? (
                        <div className="text-xs font-medium text-slate-500">
                          {isOsis
                            ? osisMembership
                              ? 'Status OSIS Anda sudah aktif.'
                              : 'Pengajuan OSIS Anda masih menunggu proses pembina.'
                            : 'Anda sudah memilih ekskul reguler untuk tahun ajaran ini.'}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-6 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span className="text-xs text-gray-500">
              Menampilkan {showingRange.start}-{Math.max(showingRange.start, showingRange.end)} dari {showingRange.total}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  page <= 1
                    ? 'border-gray-200 text-gray-400'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Prev
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmitSelectedItem || enrollMutation.isPending || osisJoinMutation.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  !canSubmitSelectedItem || enrollMutation.isPending || osisJoinMutation.isPending
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : selectedIsOsis
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {submitButtonLabel}
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(pagination?.totalPages || 1, prev + 1))}
                disabled={page >= (pagination?.totalPages || 1)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
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
      </div>
    </div>
  );
};
