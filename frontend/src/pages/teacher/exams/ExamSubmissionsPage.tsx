import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { examService } from '../../../services/exam.service';
import { liveQueryOptions } from '../../../lib/query/liveQuery';

type SessionStatusFilter = '' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function statusLabel(value: string): string {
  if (value === 'COMPLETED') return 'Selesai';
  if (value === 'IN_PROGRESS') return 'Berlangsung';
  if (value === 'TIMEOUT') return 'Timeout';
  return value;
}

function statusClass(value: string): string {
  if (value === 'COMPLETED') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (value === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (value === 'TIMEOUT') return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function correctnessClass(value: boolean | null): string {
  if (value === true) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (value === false) return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function correctnessLabel(value: boolean | null): string {
  if (value === true) return 'Benar';
  if (value === false) return 'Salah';
  return 'Belum Dinilai';
}

export const ExamSubmissionsPage = () => {
  const PAGE_SIZE = 50;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const packetId = Number(id);
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>('');
  const [page, setPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, string>>({});
  const [savingSessionId, setSavingSessionId] = useState<number | null>(null);

  const submissionsQuery = useQuery({
    queryKey: ['exam-packet-submissions', packetId, statusFilter, page],
    enabled: Number.isFinite(packetId) && packetId > 0,
    queryFn: async () => {
      const response = await examService.getPacketSubmissions(packetId, {
        ...(statusFilter ? { status: statusFilter } : {}),
        page,
        limit: PAGE_SIZE,
      });
      return response.data;
    },
    ...liveQueryOptions,
  });

  const sessionDetailQuery = useQuery({
    queryKey: ['exam-session-detail', selectedSessionId],
    enabled: selectedSessionId !== null,
    queryFn: async () => {
      const response = await examService.getSessionDetail(selectedSessionId!);
      return response.data;
    },
    ...liveQueryOptions,
  });

  const selectedSession = useMemo(() => {
    if (!selectedSessionId || !submissionsQuery.data) return null;
    return submissionsQuery.data.sessions.find((item) => item.sessionId === selectedSessionId) || null;
  }, [selectedSessionId, submissionsQuery.data]);

  const saveScoreMutation = useMutation({
    mutationFn: async (payload: { sessionId: number; score: number }) => {
      const response = await examService.updateSessionScore(payload.sessionId, payload.score);
      return response.data;
    },
    onSuccess: async (_, payload) => {
      toast.success('Nilai berhasil disimpan.');
      setScoreDrafts((prev) => ({
        ...prev,
        [payload.sessionId]: payload.score.toString(),
      }));
      await submissionsQuery.refetch();
      if (selectedSessionId === payload.sessionId) {
        await sessionDetailQuery.refetch();
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Gagal menyimpan nilai.';
      toast.error(message);
    },
    onSettled: () => {
      setSavingSessionId(null);
    },
  });

  const handleSaveScore = (params: {
    sessionId: number;
    status: string;
    currentScore: number | null;
    rawScore: string;
  }) => {
    const normalizedStatus = String(params.status || '').toUpperCase();
    if (!['COMPLETED', 'TIMEOUT'].includes(normalizedStatus)) {
      toast.error('Nilai hanya bisa diubah untuk sesi yang sudah selesai/timeout.');
      return;
    }

    const normalizedInput = params.rawScore.replace(',', '.').trim();
    if (!normalizedInput) {
      toast.error('Nilai wajib diisi.');
      return;
    }

    const parsed = Number.parseFloat(normalizedInput);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error('Nilai harus berada pada rentang 0 sampai 100.');
      return;
    }

    const normalizedScore = Math.round(parsed * 100) / 100;
    const normalizedCurrentScore =
      typeof params.currentScore === 'number' ? Math.round(params.currentScore * 100) / 100 : null;

    if (normalizedCurrentScore !== null && normalizedCurrentScore === normalizedScore) {
      toast('Nilai belum berubah.');
      return;
    }

    setSavingSessionId(params.sessionId);
    saveScoreMutation.mutate({
      sessionId: params.sessionId,
      score: normalizedScore,
    });
  };

  const summary = submissionsQuery.data?.summary;
  const packet = submissionsQuery.data?.packet;
  const totalPages = summary?.totalPages || 1;
  const currentPage = summary?.page || page;
  const canPrevPage = currentPage > 1;
  const canNextPage = currentPage < totalPages;

  if (!Number.isFinite(packetId) || packetId <= 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Submission Ujian</h1>
        <p className="text-sm text-red-600">ID packet ujian tidak valid.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Submission Ujian</h1>
          <p className="text-sm text-gray-600">
            {packet ? `${packet.title} • ${packet.subject.name} (${packet.subject.code})` : 'Memuat data packet...'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Diperbarui: {summary ? formatDateTime(summary.generatedAt) : '-'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as SessionStatusFilter);
              setSelectedSessionId(null);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Semua Status</option>
            <option value="IN_PROGRESS">Berlangsung</option>
            <option value="COMPLETED">Selesai</option>
            <option value="TIMEOUT">Timeout</option>
          </select>
          <button
            onClick={() => submissionsQuery.refetch()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Muat Ulang
          </button>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Total Sesi</p>
            <p className="text-2xl font-bold text-gray-900">{summary.sessionCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Peserta</p>
            <p className="text-2xl font-bold text-blue-700">{summary.participantCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Selesai/Timeout</p>
            <p className="text-2xl font-bold text-emerald-700">{summary.submittedCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Rata-rata Nilai</p>
            <p className="text-2xl font-bold text-gray-900">{summary.averageScore === null ? '-' : summary.averageScore.toFixed(2)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Halaman</p>
            <p className="text-2xl font-bold text-gray-900">{summary.page}/{summary.totalPages}</p>
            <p className="text-xs text-gray-500 mt-1">
              Tampil {summary.pageSessionCount} dari {summary.sessionCount} sesi
            </p>
          </div>
        </div>
      ) : null}

      {submissionsQuery.isLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
          Memuat daftar submission...
        </div>
      ) : null}

      {submissionsQuery.isError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          Gagal memuat daftar submission ujian.
        </div>
      ) : null}

      {!submissionsQuery.isLoading && !submissionsQuery.isError && submissionsQuery.data ? (
        submissionsQuery.data.sessions.length > 0 ? (
          <>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold w-16">No</th>
                      <th className="text-left px-4 py-3 font-semibold">Nama Siswa</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Nilai</th>
                      <th className="text-left px-4 py-3 font-semibold">Progress Jawaban</th>
                      <th className="text-left px-4 py-3 font-semibold">Waktu</th>
                      <th className="text-left px-4 py-3 font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionsQuery.data.sessions.map((item, index) => (
                      <tr key={item.sessionId} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3 text-gray-700">
                          {(currentPage - 1) * PAGE_SIZE + index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{item.student.name}</p>
                          <p className="text-xs text-gray-500">NIS: {item.student.nis || '-'}</p>
                          <p className="text-xs text-gray-500">Kelas: {item.class?.name || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${statusClass(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {(() => {
                            const normalizedStatus = String(item.status || '').toUpperCase();
                            const canEdit = normalizedStatus === 'COMPLETED' || normalizedStatus === 'TIMEOUT';
                            const draftScore = scoreDrafts[item.sessionId] ?? (item.score === null ? '' : String(item.score));
                            const normalizedInput = draftScore.replace(',', '.').trim();
                            const parsedDraft = Number.parseFloat(normalizedInput);
                            const hasValidDraft =
                              normalizedInput !== '' &&
                              Number.isFinite(parsedDraft) &&
                              parsedDraft >= 0 &&
                              parsedDraft <= 100;
                            const normalizedDraftScore = hasValidDraft ? Math.round(parsedDraft * 100) / 100 : null;
                            const normalizedCurrentScore =
                              typeof item.score === 'number' ? Math.round(item.score * 100) / 100 : null;
                            const isChanged = normalizedDraftScore !== null && normalizedDraftScore !== normalizedCurrentScore;
                            const isSavingRow = savingSessionId === item.sessionId && saveScoreMutation.isPending;

                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.01}
                                    value={draftScore}
                                    disabled={!canEdit || isSavingRow}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setScoreDrafts((prev) => ({
                                        ...prev,
                                        [item.sessionId]: nextValue,
                                      }));
                                    }}
                                    className={`w-24 px-2 py-1 rounded border text-xs ${
                                      canEdit
                                        ? 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200'
                                        : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                  />
                                  <button
                                    onClick={() =>
                                      handleSaveScore({
                                        sessionId: item.sessionId,
                                        status: item.status,
                                        currentScore: item.score,
                                        rawScore: draftScore,
                                      })
                                    }
                                    disabled={!canEdit || !hasValidDraft || !isChanged || saveScoreMutation.isPending}
                                    className="inline-flex items-center px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSavingRow ? 'Menyimpan...' : 'Simpan'}
                                  </button>
                                </div>
                                {!canEdit ? (
                                  <p className="text-[11px] text-gray-400">Edit aktif setelah sesi selesai/timeout.</p>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 space-y-1">
                          <p>
                            {item.answeredCount}/{item.totalQuestions} ({formatPercent(item.completionRate)})
                          </p>
                          <p>Objektif benar: {item.objectiveCorrect}</p>
                          <p>Objektif salah: {item.objectiveIncorrect}</p>
                          <p>
                            Pelanggaran: {item.monitoring?.totalViolations || 0}
                            {' '}(
                            tab: {item.monitoring?.tabSwitchCount || 0},{' '}
                            fullscreen: {item.monitoring?.fullscreenExitCount || 0},{' '}
                            app: {item.monitoring?.appSwitchCount || 0}
                            )
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 space-y-1">
                          <p>Mulai: {formatDateTime(item.startTime)}</p>
                          <p>Kumpul: {formatDateTime(item.submitTime)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedSessionId(item.sessionId)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                          >
                            <Eye className="w-3 h-3" />
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Halaman {currentPage} dari {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!canPrevPage) return;
                    setSelectedSessionId(null);
                    setPage((prev) => Math.max(1, prev - 1));
                  }}
                  disabled={!canPrevPage}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sebelumnya
                </button>
                <button
                  onClick={() => {
                    if (!canNextPage) return;
                    setSelectedSessionId(null);
                    setPage((prev) => prev + 1);
                  }}
                  disabled={!canNextPage}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500">
            Belum ada sesi ujian yang cocok dengan filter saat ini.
          </div>
        )
      ) : null}

      {selectedSessionId ? (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 w-full max-w-5xl max-h-[90vh] overflow-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-gray-900">Detail Jawaban Sesi</h2>
              <p className="text-xs text-gray-500">
                {selectedSession ? `${selectedSession.student.name} • ${selectedSession.class?.name || '-'}` : `Session #${selectedSessionId}`}
              </p>
            </div>
            <button
              onClick={() => setSelectedSessionId(null)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              Tutup Detail
            </button>
          </div>

          {sessionDetailQuery.isLoading ? (
            <p className="text-sm text-gray-500">Memuat detail jawaban...</p>
          ) : null}

          {sessionDetailQuery.isError ? (
            <p className="text-sm text-red-600">Gagal memuat detail jawaban sesi.</p>
          ) : null}

          {!sessionDetailQuery.isLoading && !sessionDetailQuery.isError && sessionDetailQuery.data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="text-sm font-semibold text-gray-900">{statusLabel(sessionDetailQuery.data.session.status)}</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Nilai</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {sessionDetailQuery.data.session.score === null ? '-' : sessionDetailQuery.data.session.score.toFixed(2)}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Progress</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {sessionDetailQuery.data.summary.answeredCount}/{sessionDetailQuery.data.summary.totalQuestions}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Akurasi Objektif</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {sessionDetailQuery.data.summary.objectiveCorrectCount}/
                    {sessionDetailQuery.data.summary.objectiveEvaluableCount}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Pelanggaran</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {sessionDetailQuery.data.session.monitoring?.totalViolations || 0}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    tab: {sessionDetailQuery.data.session.monitoring?.tabSwitchCount || 0},{' '}
                    fullscreen: {sessionDetailQuery.data.session.monitoring?.fullscreenExitCount || 0},{' '}
                    app: {sessionDetailQuery.data.session.monitoring?.appSwitchCount || 0}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {sessionDetailQuery.data.questions.map((question) => (
                  <div key={question.questionId} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="font-semibold text-gray-900">
                        Soal {question.orderNumber} • {question.type}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${correctnessClass(question.isCorrect)}`}>
                        {correctnessLabel(question.isCorrect)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{question.contentPreview}</p>
                    <p className="text-xs text-gray-600">Jawaban teks: {question.answerText || '-'}</p>
                    <p className="text-xs text-gray-600">
                      Opsi dipilih: {question.selectedOptionLabels.length > 0 ? question.selectedOptionLabels.join(', ') : '-'}
                    </p>
                    <p className="text-xs text-gray-600">
                      Opsi benar: {question.correctOptionLabels.length > 0 ? question.correctOptionLabels.join(', ') : '-'}
                    </p>
                    {question.explanation ? (
                      <p className="text-xs text-slate-700 mt-2 bg-slate-50 border border-slate-200 rounded p-2">
                        Pembahasan: {question.explanation}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
        </div>
      ) : null}
    </div>
  );
};
