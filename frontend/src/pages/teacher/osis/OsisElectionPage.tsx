import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  Pencil,
  Plus,
  Save,
  Trash2,
  Trophy,
  Users,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ActiveAcademicYearNotice } from '../../../components/ActiveAcademicYearNotice';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import {
  osisService,
  type CreateOsisElectionCandidatePayload,
  type CreateOsisElectionPeriodPayload,
  type OsisElectionCandidate,
  type OsisElectionPeriod,
  type OsisEligibleStudent,
} from '../../../services/osis.service';

const statusOptions: Array<OsisElectionPeriod['status']> = ['DRAFT', 'PUBLISHED', 'CLOSED'];

const formatDateTimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const normalized = new Date(date.getTime() - offset * 60_000);
  return normalized.toISOString().slice(0, 16);
};

const createEmptyPeriodForm = (academicYearId?: number): CreateOsisElectionPeriodPayload => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    academicYearId: academicYearId || 0,
    title: '',
    description: '',
    startAt: formatDateTimeLocal(start.toISOString()),
    endAt: formatDateTimeLocal(end.toISOString()),
    status: 'DRAFT',
    allowQuickCount: true,
  };
};

const createEmptyCandidateForm = (): CreateOsisElectionCandidatePayload => ({
  studentId: 0,
  candidateNumber: 1,
  vision: '',
  mission: '',
  youtubeUrl: '',
  isActive: true,
});

export const OsisElectionPage = () => {
  const queryClient = useQueryClient();
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const academicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0);

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodForm, setPeriodForm] = useState<CreateOsisElectionPeriodPayload>(createEmptyPeriodForm());
  const [candidateForm, setCandidateForm] = useState<CreateOsisElectionCandidatePayload>(createEmptyCandidateForm());
  const [editingCandidateId, setEditingCandidateId] = useState<number | null>(null);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [periodModalMode, setPeriodModalMode] = useState<'create' | 'edit'>('create');

  const periodsQuery = useQuery({
    queryKey: ['osis-periods', academicYearId],
    queryFn: async () => {
      const response = await osisService.getPeriods(academicYearId ? { academicYearId } : undefined);
      return response.data;
    },
    enabled: academicYearId > 0,
  });

  const quickCountQuery = useQuery({
    queryKey: ['osis-quick-count', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return null;
      const response = await osisService.getQuickCount(selectedPeriodId);
      return response.data;
    },
    enabled: Boolean(selectedPeriodId),
  });

  const eligibleStudentsQuery = useQuery({
    queryKey: ['osis-eligible-students', academicYearId],
    queryFn: async () => {
      if (!academicYearId) return [] as OsisEligibleStudent[];
      const response = await osisService.getEligibleStudents({
        academicYearId,
        search: undefined,
      });
      return response.data;
    },
    enabled: academicYearId > 0,
  });

  const periods = periodsQuery.data || [];
  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) || null,
    [periods, selectedPeriodId],
  );

  useEffect(() => {
    if (!selectedPeriod && academicYearId) {
      setPeriodForm(createEmptyPeriodForm(academicYearId));
      return;
    }
    if (selectedPeriod) {
      setSelectedPeriodId(selectedPeriod.id);
      setPeriodForm({
        academicYearId: selectedPeriod.academicYearId,
        title: selectedPeriod.title,
        description: selectedPeriod.description || '',
        startAt: formatDateTimeLocal(selectedPeriod.startAt),
        endAt: formatDateTimeLocal(selectedPeriod.endAt),
        status: selectedPeriod.status,
        allowQuickCount: Boolean(selectedPeriod.allowQuickCount),
      });
    }
  }, [selectedPeriod?.id, academicYearId]);

  const resetCandidateForm = () => {
    setCandidateForm(createEmptyCandidateForm());
    setEditingCandidateId(null);
    setIsCandidateModalOpen(false);
  };

  const refetchAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['osis-periods'] });
    await queryClient.invalidateQueries({ queryKey: ['osis-quick-count'] });
  };

  const savePeriodMutation = useMutation({
    mutationFn: async (payload: CreateOsisElectionPeriodPayload) => {
      if (periodModalMode === 'edit' && selectedPeriod?.id) {
        return osisService.updatePeriod(selectedPeriod.id, payload);
      }
      return osisService.createPeriod(payload);
    },
    onSuccess: async (response) => {
      const saved = response.data;
      toast.success(periodModalMode === 'edit' ? 'Periode OSIS diperbarui' : 'Periode OSIS dibuat');
      setSelectedPeriodId(saved.id);
      setIsPeriodModalOpen(false);
      await refetchAll();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menyimpan periode OSIS');
    },
  });

  const saveCandidateMutation = useMutation({
    mutationFn: async (payload: CreateOsisElectionCandidatePayload) => {
      if (!selectedPeriod?.id) throw new Error('Pilih atau buat periode pemilihan terlebih dulu');
      if (editingCandidateId) {
        return osisService.updateCandidate(editingCandidateId, payload);
      }
      return osisService.createCandidate(selectedPeriod.id, payload);
    },
    onSuccess: async () => {
      toast.success(editingCandidateId ? 'Calon diperbarui' : 'Calon ditambahkan');
      resetCandidateForm();
      await refetchAll();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menyimpan calon OSIS');
    },
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: async (candidateId: number) => osisService.deleteCandidate(candidateId),
    onSuccess: async () => {
      toast.success('Calon dihapus');
      resetCandidateForm();
      await refetchAll();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal menghapus calon');
    },
  });

  const finalizePeriodMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error('Pilih periode pemilihan terlebih dulu');
      return osisService.finalizePeriod(selectedPeriod.id);
    },
    onSuccess: async () => {
      toast.success('Periode pemilihan berhasil difinalisasi');
      setIsFinalizeModalOpen(false);
      await refetchAll();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal memfinalisasi periode');
    },
  });

  const stats = useMemo(() => {
    const totalCandidates = selectedPeriod?.candidates?.length || 0;
    const totalVotes = quickCountQuery.data?.totalVotes || selectedPeriod?._count?.votes || 0;
    const activeCandidates = selectedPeriod?.candidates?.filter((candidate) => candidate.isActive).length || 0;
    return { totalCandidates, totalVotes, activeCandidates };
  }, [quickCountQuery.data, selectedPeriod]);

  const quickCount = quickCountQuery.data;
  const winnerSummary = quickCount?.winner || null;

  const startNewPeriod = () => {
    setPeriodModalMode('create');
    setSelectedPeriodId(null);
    setPeriodForm(createEmptyPeriodForm(academicYearId));
    resetCandidateForm();
    setIsPeriodModalOpen(true);
  };

  const startEditingPeriod = () => {
    if (!selectedPeriod) return;
    setPeriodModalMode('edit');
    setPeriodForm({
      academicYearId: selectedPeriod.academicYearId,
      title: selectedPeriod.title,
      description: selectedPeriod.description || '',
      startAt: formatDateTimeLocal(selectedPeriod.startAt),
      endAt: formatDateTimeLocal(selectedPeriod.endAt),
      status: selectedPeriod.status,
      allowQuickCount: Boolean(selectedPeriod.allowQuickCount),
    });
    setIsPeriodModalOpen(true);
  };

  const startEditingCandidate = (candidate: OsisElectionCandidate) => {
    setEditingCandidateId(candidate.id);
    setCandidateForm({
      studentId: candidate.studentId,
      candidateNumber: candidate.candidateNumber,
      vision: candidate.vision || '',
      mission: candidate.mission || '',
      youtubeUrl: candidate.youtubeUrl || '',
      isActive: candidate.isActive,
    });
    setIsCandidateModalOpen(true);
  };

  const startNewCandidate = () => {
    resetCandidateForm();
    setCandidateForm((prev) => ({ ...prev, candidateNumber: (selectedPeriod?.candidates?.length || 0) + 1 }));
    setIsCandidateModalOpen(true);
  };

  const finalizeRows = quickCount?.candidates || [];

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pemilihan OSIS</h1>
          <p className="mt-1 text-sm text-gray-600">
            Kelola periode pemilihan, calon ketua OSIS, quick count, dan tautan video orasi.
          </p>
        </div>

        <ActiveAcademicYearNotice
          name={activeAcademicYear?.name}
          semester={activeAcademicYear?.semester}
          helperText="Pemilihan OSIS di halaman ini selalu mengikuti tahun ajaran aktif yang tampil di header aplikasi."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <div className="text-sm font-medium text-blue-700">Periode Aktif</div>
            <div className="mt-2 text-3xl font-bold text-blue-900">{periods.length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <div className="text-sm font-medium text-emerald-700">Calon Aktif</div>
            <div className="mt-2 text-3xl font-bold text-emerald-900">{stats.activeCandidates}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <div className="text-sm font-medium text-amber-700">Total Kandidat</div>
            <div className="mt-2 text-3xl font-bold text-amber-900">{stats.totalCandidates}</div>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
            <div className="text-sm font-medium text-violet-700">Suara Masuk</div>
            <div className="mt-2 text-3xl font-bold text-violet-900">{stats.totalVotes}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px,1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Daftar Periode</h2>
                <p className="text-sm text-gray-500">Klik salah satu periode untuk membuka ringkasannya.</p>
              </div>
              <button
                type="button"
                onClick={startNewPeriod}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                Baru
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {periods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => {
                    setSelectedPeriodId(period.id);
                    resetCandidateForm();
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedPeriod?.id === period.id
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{period.title}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(period.startAt).toLocaleString('id-ID')} - {new Date(period.endAt).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                      {period.status}
                    </span>
                  </div>
                </button>
              ))}
              {periods.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  Belum ada periode pemilihan OSIS.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            {!selectedPeriod ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 shadow-sm">
                Pilih salah satu card periode di sebelah kiri untuk membuka ringkasan periode, mengatur calon, dan melakukan finalisasi.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-blue-600" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Ringkasan Periode</h2>
                      <p className="text-sm text-gray-500">Kelola periode, calon ketua OSIS, quick count, dan finalisasi dari panel ini.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Judul</div>
                      <div className="mt-2 font-semibold text-gray-900">{selectedPeriod.title}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</div>
                      <div className="mt-2 font-semibold text-gray-900">{selectedPeriod.status}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mulai</div>
                      <div className="mt-2 font-semibold text-gray-900">{new Date(selectedPeriod.startAt).toLocaleString('id-ID')}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selesai</div>
                      <div className="mt-2 font-semibold text-gray-900">{new Date(selectedPeriod.endAt).toLocaleString('id-ID')}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={startEditingPeriod}
                      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Periode
                    </button>
                    <button
                      type="button"
                      onClick={startNewCandidate}
                      disabled={selectedPeriod.status === 'CLOSED'}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      Tambah Calon
                    </button>
                    {selectedPeriod.status !== 'CLOSED' ? (
                      <button
                        type="button"
                        onClick={() => setIsFinalizeModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <Trophy className="h-4 w-4" />
                        Finalisasi Hasil
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-emerald-600" />
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Daftar Calon Ketua OSIS</h2>
                        <p className="text-sm text-gray-500">Tambah dan edit calon lewat popup agar daftar calon tetap rapi.</p>
                      </div>
                    </div>

                    <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
                      <div className="divide-y divide-gray-200">
                        {selectedPeriod.candidates.length > 0 ? (
                          selectedPeriod.candidates.map((candidate) => (
                            <div key={candidate.id} className="flex items-start justify-between gap-4 px-4 py-4">
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900">
                                  No. {candidate.candidateNumber} • {candidate.student.name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {candidate.student.studentClass?.name || '-'} • {candidate.student.nis || '-'}
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                  {candidate._count?.votes || 0} suara • {candidate.isActive ? 'Aktif' : 'Nonaktif'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditingCandidate(candidate)}
                                  className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteCandidateMutation.mutate(candidate.id)}
                                  disabled={deleteCandidateMutation.isPending}
                                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-sm text-gray-500">Belum ada calon pada periode ini.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-5 w-5 text-violet-600" />
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Quick Count</h2>
                        <p className="text-sm text-gray-500">Ringkasan suara sementara yang mudah dipantau pembina OSIS.</p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      {quickCount ? (
                        <div className="grid grid-cols-1 gap-4">
                          <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
                            Total pemilih: <span className="font-semibold">{quickCount.totalEligibleVoters}</span>
                          </div>
                          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                            Partisipasi suara: <span className="font-semibold">{quickCount.turnoutPercentage}%</span>
                          </div>
                          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Belum memberi suara: <span className="font-semibold">{quickCount.remainingVoters}</span>
                          </div>
                        </div>
                      ) : null}

                      {winnerSummary ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="flex items-start gap-3">
                            <Trophy className="mt-0.5 h-5 w-5 text-emerald-600" />
                            <div>
                              <div className="text-sm font-semibold text-emerald-900">
                                {selectedPeriod.status === 'CLOSED' ? 'Pemenang Final' : 'Pimpinan Sementara'}
                              </div>
                              <div className="mt-1 text-sm text-emerald-800">
                                No. {winnerSummary.candidateNumber} • {winnerSummary.studentName} • {winnerSummary.className}
                              </div>
                              <div className="mt-1 text-xs text-emerald-700">
                                {winnerSummary.votes} suara • {winnerSummary.percentage}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : quickCount?.hasTie ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                          Suara posisi teratas masih imbang. Tinjau tabel finalisasi sebelum periode ditutup.
                        </div>
                      ) : null}

                      {quickCount?.candidates?.length ? (
                        quickCount.candidates.map((candidate) => (
                          <div key={candidate.id}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-semibold text-gray-800">
                                #{candidate.rank} • No. {candidate.candidateNumber} • {candidate.studentName}
                              </span>
                              <span className="text-gray-600">
                                {candidate.votes} suara ({candidate.percentage}%)
                              </span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${candidate.percentage}%` }} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                          Quick count akan tampil setelah ada calon dan suara masuk pada periode ini.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {isPeriodModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {periodModalMode === 'edit' ? 'Edit Periode Pemilihan' : 'Tambah Periode Baru'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">Atur judul, jadwal, status, dan quick count.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPeriodModalOpen(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Judul Pemilihan</label>
                <input
                  type="text"
                  value={periodForm.title}
                  onChange={(e) => setPeriodForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Contoh: Pemilihan Ketua OSIS 2026/2027"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Deskripsi</label>
                <textarea
                  value={periodForm.description || ''}
                  onChange={(e) => setPeriodForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="min-h-[96px] w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Informasi singkat pemilihan OSIS..."
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Mulai</label>
                  <input
                    type="datetime-local"
                    value={periodForm.startAt}
                    onChange={(e) => setPeriodForm((prev) => ({ ...prev, startAt: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Selesai</label>
                  <input
                    type="datetime-local"
                    value={periodForm.endAt}
                    onChange={(e) => setPeriodForm((prev) => ({ ...prev, endAt: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={periodForm.status}
                    onChange={(e) =>
                      setPeriodForm((prev) => ({
                        ...prev,
                        status: e.target.value as CreateOsisElectionPeriodPayload['status'],
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={periodForm.allowQuickCount}
                      onChange={(e) => setPeriodForm((prev) => ({ ...prev, allowQuickCount: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Izinkan quick count untuk semua pemilih
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsPeriodModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => savePeriodMutation.mutate({ ...periodForm, academicYearId })}
                disabled={!academicYearId || savePeriodMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                <Save className="h-4 w-4" />
                {savePeriodMutation.isPending
                  ? 'Menyimpan...'
                  : periodModalMode === 'edit'
                    ? 'Simpan Perubahan'
                    : 'Buat Periode'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCandidateModalOpen && selectedPeriod ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingCandidateId ? 'Edit Calon' : 'Tambah Calon'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Pilih kandidat, isi visi-misi, dan tambahkan tautan video orasi jika ada.
                </p>
              </div>
              <button
                type="button"
                onClick={resetCandidateForm}
                className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr,0.4fr,0.4fr]">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Calon Siswa</label>
                  <select
                    value={candidateForm.studentId || ''}
                    onChange={(e) =>
                      setCandidateForm((prev) => ({
                        ...prev,
                        studentId: Number(e.target.value || 0),
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Pilih calon siswa</option>
                    {eligibleStudentsQuery.data?.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} • {student.studentClass?.name || '-'} • {student.nis || '-'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">No. Urut</label>
                  <input
                    type="number"
                    min={1}
                    value={candidateForm.candidateNumber}
                    onChange={(e) =>
                      setCandidateForm((prev) => ({
                        ...prev,
                        candidateNumber: Number(e.target.value || 1),
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={candidateForm.isActive ?? true}
                      onChange={(e) =>
                        setCandidateForm((prev) => ({
                          ...prev,
                          isActive: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Calon aktif
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Visi</label>
                <textarea
                  value={candidateForm.vision || ''}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, vision: e.target.value }))}
                  className="min-h-[110px] w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Tulis visi calon ketua OSIS..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Misi</label>
                <textarea
                  value={candidateForm.mission || ''}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, mission: e.target.value }))}
                  className="min-h-[140px] w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Tulis misi calon ketua OSIS..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tautan Video Orasi / Promosi (YouTube)</label>
                <div className="relative">
                  <Video className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="url"
                    value={candidateForm.youtubeUrl || ''}
                    onChange={(e) => setCandidateForm((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={resetCandidateForm}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => saveCandidateMutation.mutate(candidateForm)}
                disabled={!candidateForm.studentId || saveCandidateMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                <Save className="h-4 w-4" />
                {saveCandidateMutation.isPending
                  ? 'Menyimpan...'
                  : editingCandidateId
                    ? 'Simpan Perubahan'
                    : 'Simpan Calon'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFinalizeModalOpen && selectedPeriod ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Finalisasi Hasil Pemilihan</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Pastikan tabel perolehan suara sudah benar sebelum periode ini ditutup dan dipindahkan ke arsip.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFinalizeModalOpen(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">{selectedPeriod.title}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                    Total Pemilih: <span className="font-semibold text-gray-900">{quickCount?.totalEligibleVoters ?? 0}</span>
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                    Partisipasi Suara: <span className="font-semibold text-gray-900">{quickCount?.turnoutPercentage ?? 0}%</span>
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                    Belum Memberi Suara: <span className="font-semibold text-gray-900">{quickCount?.remainingVoters ?? 0}</span>
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Peringkat</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">No Urut</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Nama Calon</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Kelas</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Suara</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Persentase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {finalizeRows.length > 0 ? (
                      finalizeRows.map((candidate) => (
                        <tr key={candidate.id}>
                          <td className="px-4 py-3 font-semibold text-gray-900">#{candidate.rank}</td>
                          <td className="px-4 py-3 text-gray-700">{candidate.candidateNumber}</td>
                          <td className="px-4 py-3 text-gray-700">{candidate.studentName}</td>
                          <td className="px-4 py-3 text-gray-700">{candidate.className}</td>
                          <td className="px-4 py-3 text-gray-700">{candidate.votes}</td>
                          <td className="px-4 py-3 text-gray-700">{candidate.percentage}%</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          Belum ada data suara untuk difinalisasi.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsFinalizeModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => finalizePeriodMutation.mutate()}
                disabled={finalizePeriodMutation.isPending || finalizeRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                <Trophy className="h-4 w-4" />
                {finalizePeriodMutation.isPending ? 'Memfinalisasi...' : 'Simpan Finalisasi'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default OsisElectionPage;
