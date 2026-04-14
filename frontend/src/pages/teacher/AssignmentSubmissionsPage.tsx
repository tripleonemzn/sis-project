import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Save, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { liveQueryOptions } from '../../lib/query/liveQuery';

type AssignmentSubmission = {
  id: number;
  assignmentId: number;
  studentId: number;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  assignment: {
    id: number;
    title: string;
    dueDate: string;
    maxScore: number;
    class: { id: number; name: string } | null;
    subject: { id: number; name: string } | null;
  };
  student: {
    id: number;
    name: string;
    nis: string | null;
  };
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreBadge(score: number | null) {
  if (score === null || score === undefined) {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  if (score >= 85) return 'bg-green-100 text-green-700 border-green-200';
  if (score >= 70) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

export const AssignmentSubmissionsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const assignmentId = Number(id);

  const [gradingTarget, setGradingTarget] = useState<AssignmentSubmission | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  const submissionsQuery = useQuery({
    queryKey: ['teacher-assignment-submissions', assignmentId],
    enabled: Number.isFinite(assignmentId) && assignmentId > 0,
    queryFn: async () => {
      const response = await api.get('/submissions', {
        params: { assignmentId, limit: 300 },
      });
      const rows = response.data?.data?.submissions || [];
      return rows as AssignmentSubmission[];
    },
    ...liveQueryOptions,
  });

  const gradingMutation = useMutation({
    mutationFn: async () => {
      if (!gradingTarget) throw new Error('Data submission tidak ditemukan.');
      const score = Number(scoreInput);
      if (Number.isNaN(score)) {
        throw new Error('Nilai harus berupa angka.');
      }
      if (score < 0) {
        throw new Error('Nilai minimal 0.');
      }
      if (score > gradingTarget.assignment.maxScore) {
        throw new Error(`Nilai maksimal ${gradingTarget.assignment.maxScore}.`);
      }

      await api.put(`/submissions/${gradingTarget.id}/grade`, {
        score,
        feedback: feedbackInput.trim() || null,
      });
    },
    onSuccess: async () => {
      toast.success('Nilai berhasil disimpan.');
      setGradingTarget(null);
      setScoreInput('');
      setFeedbackInput('');
      await queryClient.invalidateQueries({ queryKey: ['teacher-assignment-submissions', assignmentId] });
    },
    onError: (error: unknown) => {
      const message: string =
        typeof error === 'object' &&
        error !== null &&
          'response' in error &&
          typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
            'string'
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ??
              'Gagal menyimpan nilai.')
          : error instanceof Error
            ? error.message
            : 'Gagal menyimpan nilai.';
      toast.error(message || 'Gagal menyimpan nilai.');
    },
  });

  const summary = useMemo(() => {
    const rows = submissionsQuery.data || [];
    const graded = rows.filter((item) => item.score !== null && item.score !== undefined).length;
    return {
      total: rows.length,
      graded,
      ungraded: rows.length - graded,
      title: rows[0]?.assignment?.title || 'Submisi Tugas',
    };
  }, [submissionsQuery.data]);

  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return (
      <div className="p-6">
        <h1 className="text-page-title font-bold text-gray-900 mb-2">Submisi Tugas</h1>
        <p className="text-sm text-red-600">Assignment ID tidak valid.</p>
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
          <h1 className="text-page-title font-bold text-gray-900">Submisi Tugas</h1>
          <p className="text-sm text-gray-600">{summary.title}</p>
        </div>
        <button
          onClick={() => submissionsQuery.refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
        >
          Muat Ulang
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Submisi</p>
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Sudah Dinilai</p>
          <p className="text-2xl font-bold text-emerald-700">{summary.graded}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Belum Dinilai</p>
          <p className="text-2xl font-bold text-amber-700">{summary.ungraded}</p>
        </div>
      </div>

      {submissionsQuery.isLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
          Memuat daftar submission...
        </div>
      ) : null}

      {submissionsQuery.isError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          Gagal memuat daftar submission.
        </div>
      ) : null}

      {!submissionsQuery.isLoading && !submissionsQuery.isError ? (
        submissionsQuery.data && submissionsQuery.data.length > 0 ? (
          <div className="space-y-3">
            {submissionsQuery.data.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{item.student.name}</p>
                    <p className="text-xs text-gray-500">NIS: {item.student.nis || '-'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${scoreBadge(item.score)}`}>
                    {item.score === null || item.score === undefined ? 'Belum Dinilai' : `Nilai ${item.score}`}
                  </span>
                </div>

                <div className="mt-3 text-xs text-gray-600 space-y-1">
                  <p>Dikumpulkan: {formatDateTime(item.submittedAt)}</p>
                  <p>Kelas: {item.assignment.class?.name || '-'}</p>
                  <p>Mapel: {item.assignment.subject?.name || '-'}</p>
                </div>

                <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3">
                  {item.content?.trim() || 'Tidak ada jawaban teks.'}
                </div>

                <div className="mt-3 text-sm text-gray-600">
                  <p className="font-medium">Feedback:</p>
                  <p>{item.feedback?.trim() || '-'}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.fileUrl ? (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                    >
                      <Download className="w-4 h-4" />
                      Lampiran
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400">
                      <Users className="w-4 h-4" />
                      Tanpa Lampiran
                    </span>
                  )}

                  <button
                    onClick={() => {
                      setGradingTarget(item);
                      setScoreInput(item.score !== null && item.score !== undefined ? String(item.score) : '');
                      setFeedbackInput(item.feedback || '');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                    Nilai
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500">
            Belum ada submission dari siswa.
          </div>
        )
      ) : null}

      {gradingTarget ? (
        <div className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Input Nilai</h2>
              <p className="text-sm text-gray-600">{gradingTarget.student.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="grade-score">
                Nilai (0-{gradingTarget.assignment.maxScore})
              </label>
              <input
                id="grade-score"
                type="number"
                value={scoreInput}
                onChange={(event) => setScoreInput(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="grade-feedback">
                Feedback
              </label>
              <textarea
                id="grade-feedback"
                rows={3}
                value={feedbackInput}
                onChange={(event) => setFeedbackInput(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setGradingTarget(null);
                  setScoreInput('');
                  setFeedbackInput('');
                }}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                disabled={gradingMutation.isPending}
              >
                Batal
              </button>
              <button
                onClick={() => gradingMutation.mutate()}
                disabled={gradingMutation.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {gradingMutation.isPending ? 'Menyimpan...' : 'Simpan Nilai'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
