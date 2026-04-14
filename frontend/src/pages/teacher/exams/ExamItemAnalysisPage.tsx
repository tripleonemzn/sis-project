import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, RefreshCw, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { examService } from '../../../services/exam.service';
import { QuestionMediaImage } from '../../../components/common/QuestionMediaImage';
import { enhanceQuestionHtml } from '../../../utils/questionMedia';

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

const CHART_COLORS = ['#2563eb', '#f97316', '#16a34a', '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#475569'];

type ChartSlice = {
    optionId: string;
    label: string;
    isCorrect: boolean;
    selectedCount: number;
    selectedRate: number;
    percentage: number;
    color: string;
};

type OptionDist = {
    optionId?: string | number;
    label?: string;
    isCorrect?: boolean;
    selectedCount?: unknown;
    selectedRate?: unknown;
};

type AnalysisItem = {
    optionDistribution?: OptionDist[];
    orderNumber?: number;
    answeredCount?: number;
    contentHtml?: string | null;
    contentPreview?: string | null;
    questionImageUrl?: string | null;
    questionVideoUrl?: string | null;
    questionVideoType?: string | null;
    questionId?: string | number;
    type?: string;
    scoreWeight?: number;
    unansweredCount?: number;
    unansweredRate?: number | null;
    difficultyIndex?: number | null;
    difficultyCategory?: string | null;
    discriminationIndex?: number | null;
    discriminationCategory?: string | null;
    correctCount?: number | null;
    incorrectCount?: number | null;
};

function toSafeNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildChartSlices(item: AnalysisItem): ChartSlice[] {
    const options: OptionDist[] = Array.isArray(item?.optionDistribution) ? item.optionDistribution : [];
    if (options.length === 0) return [];

    const totalRate = options.reduce((sum: number, option: OptionDist) => sum + Math.max(0, toSafeNumber(option.selectedRate)), 0);
    const totalCount = options.reduce((sum: number, option: OptionDist) => sum + Math.max(0, toSafeNumber(option.selectedCount)), 0);

    return options.map((option: OptionDist, index: number) => {
        const selectedRate = Math.max(0, toSafeNumber(option.selectedRate));
        const selectedCount = Math.max(0, toSafeNumber(option.selectedCount));
        const percentage =
            totalRate > 0
                ? (selectedRate / totalRate) * 100
                : totalCount > 0
                  ? (selectedCount / totalCount) * 100
                  : 0;

        return {
            optionId: String(option.optionId || `${index}`),
            label: String(option.label || `Opsi ${index + 1}`),
            isCorrect: Boolean(option.isCorrect),
            selectedCount,
            selectedRate,
            percentage,
            color: CHART_COLORS[index % CHART_COLORS.length],
        };
    });
}

function buildPieGradient(slices: ChartSlice[]): string {
    if (!slices.length) return 'conic-gradient(#e5e7eb 0% 100%)';

    let cursor = 0;
    const parts: string[] = [];
    slices.forEach((slice) => {
        const next = Math.min(100, cursor + Math.max(0, slice.percentage));
        parts.push(`${slice.color} ${cursor.toFixed(2)}% ${next.toFixed(2)}%`);
        cursor = next;
    });

    if (cursor < 100) {
        parts.push(`#e5e7eb ${cursor.toFixed(2)}% 100%`);
    }

    return `conic-gradient(${parts.join(', ')})`;
}

export const ExamItemAnalysisPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const packetId = Number(id);
    const [isSyncing, setIsSyncing] = useState(false);

    const copyChartSummary = async (item: Pick<AnalysisItem, 'orderNumber' | 'answeredCount'>, slices: ChartSlice[]) => {
        if (!navigator?.clipboard?.writeText) {
            toast.error('Clipboard tidak didukung pada browser ini.');
            return;
        }

        const lines = [
            `Soal #${item.orderNumber}`,
            `Respon: ${item.answeredCount}`,
            ...slices.map(
                (slice) =>
                    `${slice.label}: ${slice.selectedCount} respon (${slice.percentage.toFixed(1)}%)${slice.isCorrect ? ' [Benar]' : ''}`,
            ),
        ];

        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            toast.success(`Ringkasan soal #${item.orderNumber} berhasil disalin.`);
        } catch {
            toast.error('Gagal menyalin ringkasan chart.');
        }
    };

    const analysisQuery = useQuery({
        queryKey: ['exam-packet-item-analysis', packetId],
        enabled: Number.isFinite(packetId) && packetId > 0,
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async () => {
            const response = await examService.getPacketItemAnalysis(packetId, { includeContentHtml: false });
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
        onError: (error: unknown) => {
            const message = getErrorMessage(error, 'Gagal sinkron analisis butir.');
            toast.error(message);
        },
        onSettled: () => {
            setIsSyncing(false);
        },
    });

    function getErrorMessage(err: unknown, fallback = 'Terjadi kesalahan'): string {
        if (typeof err === 'string') return err;
        if (err && typeof err === 'object') {
            const respMsg = (err as { response?: { data?: { message?: unknown } } }).response?.data?.message;
            if (typeof respMsg === 'string') return respMsg;
            const msg = (err as { message?: unknown }).message;
            if (typeof msg === 'string') return msg;
        }
        return fallback;
    }

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
                <h1 className="text-page-title font-bold text-gray-900 mb-2">Analisis Butir Soal</h1>
                <p className="text-sm text-red-600">ID packet ujian tidak valid.</p>
            </div>
        );
    }

    if (analysisQuery.isLoading) {
        return (
            <div className="p-6">
                <h1 className="text-page-title font-bold text-gray-900 mb-2">Analisis Butir Soal</h1>
                <p className="text-sm text-gray-500">Memuat analisis butir...</p>
            </div>
        );
    }

    if (analysisQuery.isError || !analysisQuery.data) {
        return (
            <div className="p-6 space-y-4">
                <h1 className="text-page-title font-bold text-gray-900">Analisis Butir Soal</h1>
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
                    <h1 className="text-page-title font-bold text-gray-900">Analisis Butir Soal</h1>
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
                    <div className="max-h-[calc(100vh-16rem)] overflow-auto divide-y divide-gray-100">
                        {items.map((item) => {
                            const slices = buildChartSlices(item);
                            const pieBackground = buildPieGradient(slices);

                            return (
                                <div key={item.questionId} className="p-4 md:p-5 space-y-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-2 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900">Soal #{item.orderNumber}</p>
                                            <div
                                                className="prose prose-sm max-w-none text-gray-800 break-words"
                                                dangerouslySetInnerHTML={{
                                                    __html: enhanceQuestionHtml(item.contentHtml || item.contentPreview, {
                                                        useQuestionImageThumbnail: true,
                                                    }),
                                                }}
                                            />
                                            {item.questionImageUrl && (
                                                <QuestionMediaImage
                                                    src={item.questionImageUrl}
                                                    alt={`Gambar Soal ${item.orderNumber}`}
                                                    preferThumbnail
                                                    className="max-h-48 w-auto rounded-lg border border-gray-200"
                                                />
                                            )}
                                            {item.questionVideoUrl &&
                                                (item.questionVideoType === 'youtube' ? (
                                                    <div className="aspect-video max-w-md overflow-hidden rounded-lg border border-gray-200">
                                                        <iframe
                                                            src={item.questionVideoUrl}
                                                            title={`Video Soal ${item.orderNumber}`}
                                                            className="h-full w-full"
                                                            loading="lazy"
                                                            allowFullScreen
                                                        />
                                                    </div>
                                                ) : (
                                                    <video
                                                        src={item.questionVideoUrl}
                                                        controls
                                                        preload="metadata"
                                                        className="max-h-48 w-auto rounded-lg border border-gray-200"
                                                    />
                                                ))}
                                        </div>

                                        {slices.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => copyChartSummary(item, slices)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                                Copy chart
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                            <p className="text-sm font-medium text-gray-800">{item.contentPreview || `Soal #${item.orderNumber}`}</p>
                                            <p className="text-xs text-gray-500 mt-1">{item.answeredCount} responses</p>
                                            <div className="mt-4 flex items-center justify-center">
                                                <div
                                                    className="h-44 w-44 rounded-full border border-white shadow-inner"
                                                    style={{ background: pieBackground }}
                                                />
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                                            {slices.length === 0 ? (
                                                <p className="text-sm text-gray-500">Distribusi opsi belum tersedia (soal non-objektif).</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {slices.map((slice) => (
                                                        <div
                                                            key={`${item.questionId}-${slice.optionId}`}
                                                            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span
                                                                    className="h-3 w-3 rounded-full shrink-0"
                                                                    style={{ backgroundColor: slice.color }}
                                                                />
                                                                <span className="text-sm text-gray-700 truncate">
                                                                    {slice.label}
                                                                    {slice.isCorrect ? ' (Benar)' : ''}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                                                                {slice.percentage.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                                            {item.type} • Bobot {item.scoreWeight}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                                            Dijawab {item.answeredCount}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                                            Tidak dijawab {item.unansweredCount}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                                            Unanswered {formatPercent(item.unansweredRate)}
                                        </span>
                                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                                            Kesukaran {formatNumber(item.difficultyIndex, 4)} ({item.difficultyCategory || '-'})
                                        </span>
                                        <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-purple-700">
                                            Pembeda {formatNumber(item.discriminationIndex, 4)} ({item.discriminationCategory || '-'})
                                        </span>
                                        <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">
                                            Benar {item.correctCount ?? '-'}
                                        </span>
                                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                                            Salah {item.incorrectCount ?? '-'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
