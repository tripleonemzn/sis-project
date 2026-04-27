import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, Search } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { gradeService, type HomeroomResultPublicationStudentRow } from '../../services/grade.service';

const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return '-';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return format(parsed, 'dd MMM yyyy HH:mm', { locale: idLocale });
};

interface HomeroomResultPublicationPanelProps {
  classId: number;
  semester: 'ODD' | 'EVEN' | '';
  programCode?: string;
}

export const HomeroomResultPublicationPanel = ({
  classId,
  semester,
  programCode,
}: HomeroomResultPublicationPanelProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [showProgramInfo, setShowProgramInfo] = useState(false);

  const normalizedProgramCode = String(programCode || '').trim().toUpperCase();

  const {
    data: resultPublicationResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'homeroom-report-result-publications',
      classId,
      semester,
      normalizedProgramCode,
      search,
    ],
    queryFn: async () => {
      if (!classId || !semester || !normalizedProgramCode) return null;
      return gradeService.getHomeroomResultPublications({
        classId,
        semester,
        publicationCode: normalizedProgramCode,
        page: 1,
        limit: 250,
        search: search.trim() || undefined,
      });
    },
    enabled: !!classId && !!semester && !!normalizedProgramCode,
  });

  const updateResultPublicationMutation = useMutation({
    mutationFn: (payload: {
      classId: number;
      studentId: number;
      publicationCode: string;
      mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    }) => gradeService.updateHomeroomResultPublication(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['homeroom-report-result-publications'] });
      toast.success('Publikasi nilai berhasil diperbarui');
    },
    onError: () => toast.error('Gagal memperbarui publikasi nilai'),
  });

  const selectedProgram = resultPublicationResponse?.selectedProgram || null;
  const rows = resultPublicationResponse?.rows || [];
  const summary = resultPublicationResponse?.summary || {
    totalStudents: 0,
    blockedStudents: 0,
    visibleStudents: 0,
    waitingWakakurStudents: 0,
  };

  const publicationTitle = useMemo(() => {
    if (selectedProgram?.label) return selectedProgram.label;
    return normalizedProgramCode || 'Program Nilai';
  }, [normalizedProgramCode, selectedProgram?.label]);

  const handleToggleResultPublication = (row: HomeroomResultPublicationStudentRow) => {
    if (!selectedProgram) {
      toast.error('Program publikasi nilai belum tersedia.');
      return;
    }

    const nextMode = row.homeroomPublication.mode === 'BLOCKED' ? 'FOLLOW_GLOBAL' : 'BLOCKED';
    const message =
      nextMode === 'BLOCKED'
        ? `Tahan publikasi nilai ${selectedProgram.shortLabel} untuk ${row.student.name}?`
        : `Kembalikan publikasi nilai ${selectedProgram.shortLabel} untuk ${row.student.name} agar mengikuti jadwal Wakakur?`;

    if (!window.confirm(message)) return;

    updateResultPublicationMutation.mutate({
      classId,
      studentId: row.student.id,
      publicationCode: selectedProgram.publicationCode,
      mode: nextMode,
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Publikasi Nilai</h3>
          <p className="text-sm text-gray-500">
            Default tetap mengikuti jadwal Wakakur. Tahan hanya jika perlu per siswa.
          </p>
        </div>

        <div className="flex items-center gap-3 lg:justify-end">
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-yellow-200 bg-yellow-50 text-yellow-600 shadow-sm transition hover:bg-yellow-100 animate-pulse"
            aria-label="Lihat panduan publikasi nilai"
            title="Panduan publikasi nilai"
          >
            <AlertCircle className="h-5 w-5" />
          </button>
          {selectedProgram ? (
            <button
              type="button"
              onClick={() => setShowProgramInfo(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 shadow-sm transition hover:bg-blue-100 animate-pulse"
              aria-label={`Lihat jadwal rilis ${publicationTitle}`}
              title={`Jadwal rilis ${publicationTitle}`}
            >
              <CalendarClock className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
          Total siswa: {summary.totalStudents}
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
          Sudah tampil: {summary.visibleStudents}
        </span>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
          Ditahan wali: {summary.blockedStudents}
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
          Menunggu Wakakur: {summary.waitingWakakurStudents}
        </span>
      </div>

      <div className="relative w-full sm:w-72">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Cari siswa..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
        />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 px-4 py-10 text-center text-gray-500">
          Memuat kontrol publikasi nilai...
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-10 text-center text-rose-700">
          <p className="font-medium">Gagal memuat kontrol publikasi nilai.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-700"
          >
            Coba Lagi
          </button>
        </div>
      ) : !selectedProgram ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-gray-500">
          Program nilai ini belum punya konfigurasi publikasi siswa.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-gray-500">
          Tidak ada siswa yang ditemukan untuk pencarian ini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-[980px] w-full table-fixed text-xs">
            <thead className="bg-gray-50">
              <tr className="text-left uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 w-10">No</th>
                <th className="px-3 py-2 w-[16%]">NIS / NISN</th>
                <th className="px-3 py-2 w-[24%]">Nama Siswa</th>
                <th className="px-3 py-2 w-[22%]">Gate Wali Kelas</th>
                <th className="px-3 py-2 w-[22%]">Status ke Siswa</th>
                <th className="px-3 py-2 text-right w-[16%]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row, index) => {
                const isBlocked = row.homeroomPublication.mode === 'BLOCKED';
                const visibilityTone =
                  row.effectiveVisibility.tone === 'green'
                    ? 'bg-emerald-50 text-emerald-700'
                    : row.effectiveVisibility.tone === 'amber'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-700';

                return (
                  <tr key={row.student.id} className="align-top">
                    <td className="px-3 py-3 text-gray-500">{index + 1}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">{row.student.nis || '-'}</p>
                      <p className="text-gray-500">NISN: {row.student.nisn || '-'}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      <p className="font-medium text-gray-900">{row.student.name}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      <p className="font-medium text-gray-900">{row.homeroomPublication.label}</p>
                      <p className="mt-1 text-gray-500">{row.homeroomPublication.description}</p>
                      <p className="mt-1 text-gray-500">
                        {row.homeroomPublication.updatedAt
                          ? `Diperbarui ${formatDateTime(row.homeroomPublication.updatedAt)}`
                          : 'Belum ada override manual'}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${visibilityTone}`}>
                        {row.effectiveVisibility.label}
                      </span>
                      <p className="mt-2 text-gray-600">{row.effectiveVisibility.description}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleResultPublication(row)}
                          disabled={updateResultPublicationMutation.isPending}
                          className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            isBlocked
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-rose-600 text-white hover:bg-rose-700'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {isBlocked ? 'Publikasikan' : 'Tahan'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-yellow-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Panduan Publikasi Nilai</h3>
                <p className="mt-1 text-sm text-gray-500">Ikuti jadwal Kurikulum, lalu tahan hanya jika memang perlu per siswa.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>Default publikasi nilai tetap mengikuti jadwal rilis dari Wakakur/Kurikulum.</li>
              <li>Gunakan kontrol ini hanya jika wali kelas perlu menahan hasil nilai siswa tertentu.</li>
              <li>Penahanan bersifat per siswa dan tidak memengaruhi siswa lain di kelas yang sama.</li>
            </ul>
          </div>
        </div>
      ) : null}

      {showProgramInfo && selectedProgram ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-blue-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{publicationTitle}</h3>
                <p className="mt-1 text-sm text-gray-500">Status rilis global dari Wakakur untuk jenis nilai pada tab ini.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProgramInfo(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Status Rilis</div>
              <div className="mt-1 font-semibold">{selectedProgram.globalRelease.label}</div>
              <div className="mt-2 text-sm leading-relaxed text-blue-800">
                {selectedProgram.globalRelease.description}
              </div>
              <div className="mt-3 text-xs text-blue-700">
                {selectedProgram.globalRelease.effectiveDate
                  ? `Efektif ${formatDateTime(selectedProgram.globalRelease.effectiveDate)}`
                  : 'Tanpa tanggal khusus'}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
