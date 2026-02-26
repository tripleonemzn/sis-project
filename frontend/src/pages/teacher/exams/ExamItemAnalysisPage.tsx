import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { examService } from '../../../services/exam.service';

function formatNumber(value: number | null, digits = 2): string {
    if (value === null || Number.isNaN(value)) return '-';
    return value.toFixed(digits);
}

function formatPercent(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '-';
    return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value: string): string {
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

export const ExamItemAnalysisPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const packetId = Number(id);
    const [isSyncing, setIsSyncing] = useState(false);

    const analysisQuery = useQuery({
        queryKey: ['exam-packet-item-analysis', packetId],
        enabled: Number.isFinite(packetId) && packetId > 0,
        queryFn: async () => {
            const response = await examService.getPacketItemAnalysis(packetId);
            return response.data;
        },
    });

    const syncMutation = useMutation({
        mutationFn: async () => {
            setIsSyncing(true);
            const response = await examService.syncPacketItemAnalysis(packetId);
            return response.data;
        },
        onSuccess: async () => {
            toast.success('Analisis butir tersinkron ke packet ujian.');
            await queryClient.invalidateQueries({ queryKey: ['exam-packet-item-analysis', packetId] });
            await queryClient.invalidateQueries({ queryKey: ['exam-packets'] });
        },
        onError: (error: any) => {
            const message = error?.response?.data?.message || error?.message || 'Gagal sinkron analisis butir.';
            toast.error(message);
        },
        onSettled: () => {
            setIsSyncing(false);
        },
    });

    const summaryCards = useMemo(() => {
        const summary = analysisQuery.data?.summary;
        if (!summary) return [];
        return [
            { label: 'Responden', value: summary.participantCount },
            { label: 'Sedang Mengerjakan', value: summary.inProgressCount },
            { label: 'Jumlah Soal', value: summary.totalQuestions },
            { label: 'Rata-rata Nilai', value: summary.averageScore === null ? '-' : summary.averageScore.toFixed(2) },
        ];
    }, [analysisQuery.data]);

    if (!Number.isFinite(packetId) || packetId <= 0) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Analisis Butir Soal</h1>
                <p className="text-sm text-red-600">ID packet ujian tidak valid.</p>
            </div>
        );
    }

    if (analysisQuery.isLoading) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Analisis Butir Soal</h1>
                <p className="text-sm text-gray-500">Memuat analisis butir...</p>
            </div>
        );
    }

    if (analysisQuery.isError || !analysisQuery.data) {
        return (
            <div className="p-6 space-y-4">
                <h1 className="text-2xl font-bold text-gray-900">Analisis Butir Soal</h1>
                <p className="text-sm text-red-600">Gagal mengambil analisis butir soal.</p>
                <button
                    onClick={() => analysisQuery.refetch()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                    <RefreshCw className="w-4 h-4" />
                    Coba Lagi
                </button>
            </div>
        );
    }

    const { packet, summary, items } = analysisQuery.data;

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
                    <h1 className="text-2xl font-bold text-gray-900">Analisis Butir Soal</h1>
                    <p className="text-sm text-gray-600">
                        {packet.title} • {packet.subject.name} ({packet.subject.code})
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Diperbarui: {formatDateTime(summary.generatedAt)}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => analysisQuery.refetch()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Muat Ulang
                    </button>
                    <button
                        onClick={() => syncMutation.mutate()}
                        disabled={isSyncing || syncMutation.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                        <Save className="w-4 h-4" />
                        {isSyncing ? 'Sinkronisasi...' : 'Sinkronkan ke Packet'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {summaryCards.map((card) => (
                    <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="text-xs text-gray-500">{card.label}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-800">Detail Per Butir</h2>
                </div>

                {items.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">Belum ada data sesi siswa untuk dianalisis.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold">No</th>
                                    <th className="text-left px-4 py-3 font-semibold">Butir Soal</th>
                                    <th className="text-left px-4 py-3 font-semibold">Respon</th>
                                    <th className="text-left px-4 py-3 font-semibold">Kesukaran</th>
                                    <th className="text-left px-4 py-3 font-semibold">Daya Pembeda</th>
                                    <th className="text-left px-4 py-3 font-semibold">Distribusi Opsi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.questionId} className="border-t border-gray-100 align-top">
                                        <td className="px-4 py-3 font-semibold text-gray-700">{item.orderNumber}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-800">{item.contentPreview}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {item.type} • Bobot {item.scoreWeight}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-700 space-y-1">
                                            <p>Dijawab: {item.answeredCount}</p>
                                            <p>Tidak dijawab: {item.unansweredCount}</p>
                                            <p>Unanswered rate: {formatPercent(item.unansweredRate)}</p>
                                            <p>Benar: {item.correctCount ?? '-'}</p>
                                            <p>Salah: {item.incorrectCount ?? '-'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-700">
                                            <p>Indeks: {formatNumber(item.difficultyIndex, 4)}</p>
                                            <p className="mt-1">Kategori: {item.difficultyCategory || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-700">
                                            <p>Indeks: {formatNumber(item.discriminationIndex, 4)}</p>
                                            <p className="mt-1">Kategori: {item.discriminationCategory || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.optionDistribution.length === 0 ? (
                                                <span className="text-xs text-gray-400">-</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {item.optionDistribution.map((option) => (
                                                        <span
                                                            key={`${item.questionId}-${option.optionId}`}
                                                            className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] border ${
                                                                option.isCorrect
                                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                                    : 'bg-gray-50 text-gray-700 border-gray-200'
                                                            }`}
                                                        >
                                                            {option.label}: {option.selectedCount} ({formatPercent(option.selectedRate)})
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

