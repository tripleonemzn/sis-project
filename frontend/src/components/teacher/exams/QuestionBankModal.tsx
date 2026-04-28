import { useState, useEffect, useCallback } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { examService } from '../../../services/exam.service';
import type { Question } from '../../../services/exam.service';
import { toast } from 'react-hot-toast';
import { enhanceQuestionHtml } from '../../../utils/questionMedia';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';

interface QuestionBankModalProps {
    onClose: () => void;
    onSelectQuestions: (questions: Question[]) => void;
    initialSubjectId?: number;
    initialAcademicYearId?: number;
    initialSemester?: string;
}

export const QuestionBankModal = ({
    onClose,
    onSelectQuestions,
    initialSubjectId,
    initialAcademicYearId,
    initialSemester,
}: QuestionBankModalProps) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();
    
    // Filters
    const [filters, setFilters] = useState({
        subjectId: initialSubjectId?.toString() || '',
        semester: initialSemester || '',
        type: '',
        search: ''
    });

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const effectiveAcademicYearId = activeAcademicYear?.id || initialAcademicYearId || null;

    const fetchQuestions = useCallback(async () => {
        if (!effectiveAcademicYearId) {
            setQuestions([]);
            setTotalPages(1);
            return;
        }
        setLoading(true);
        try {
            const res = await examService.getQuestions({
                page,
                limit: 20,
                subjectId: filters.subjectId ? parseInt(filters.subjectId) : undefined,
                academicYearId: Number(effectiveAcademicYearId),
                semester: filters.semester || undefined,
                type: filters.type || undefined,
                search: filters.search
            });
            
            // Handle different response structures
            const questionsData = res.data?.questions || (Array.isArray(res.data) ? res.data : []);
            setQuestions(questionsData);
            setTotalPages(res.data?.meta?.totalPages || 1);
        } catch (error) {
            console.error(error);
            toast.error('Gagal memuat soal');
        } finally {
            setLoading(false);
        }
    }, [effectiveAcademicYearId, filters.search, filters.semester, filters.subjectId, filters.type, page]);

    useEffect(() => {
        void fetchQuestions();
    }, [fetchQuestions]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchQuestions();
    };

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleAdd = () => {
        const selectedQuestions = questions.filter(q => selectedIds.has(q.id));
        onSelectQuestions(selectedQuestions);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-800">Bank Soal</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-4 bg-gray-50 border-b border-gray-100">

                    {!isLoadingActiveAcademicYear && !effectiveAcademicYearId ? (
                        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar bank soal tidak ambigu.
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">

                        <select
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                            value={filters.semester}
                            onChange={e => {
                                setFilters({...filters, semester: e.target.value});
                                setPage(1);
                            }}
                        >
                            <option value="">Semua Semester</option>
                            <option value="ODD">Ganjil</option>
                            <option value="EVEN">Genap</option>
                        </select>

                        <select
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                            value={filters.type}
                            onChange={e => {
                                setFilters({...filters, type: e.target.value});
                                setPage(1);
                            }}
                        >
                            <option value="">Semua Tipe</option>
                            <option value="MULTIPLE_CHOICE">Pilihan Ganda</option>
                            <option value="ESSAY">Essay</option>
                            <option value="TRUE_FALSE">Benar/Salah</option>
                            <option value="COMPLEX_MULTIPLE_CHOICE">Pilihan Ganda Kompleks</option>
                            <option value="MATRIX_SINGLE_CHOICE">Pilihan Ganda Grid</option>
                        </select>

                        <form onSubmit={handleSearch} className="flex-1 min-w-[200px] relative">
                            <input
                                type="text"
                                placeholder="Cari konten soal..."
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                                value={filters.search}
                                onChange={e => setFilters({...filters, search: e.target.value})}
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        </form>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">Memuat soal...</div>
                    ) : questions.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">Tidak ada soal ditemukan</div>
                    ) : (
                        questions.map(q => (
                            <div 
                                key={q.id} 
                                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                    selectedIds.has(q.id) 
                                        ? 'border-blue-500 bg-blue-50' 
                                        : 'border-gray-200 hover:border-blue-300'
                                }`}
                                onClick={() => toggleSelection(q.id)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center mt-1 transition-colors ${
                                        selectedIds.has(q.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                                    }`}>
                                        {selectedIds.has(q.id) && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                                {q.type === 'MATRIX_SINGLE_CHOICE' ? 'PILIHAN GANDA GRID' : q.type.replace(/_/g, ' ')}
                                            </span>
                                            <span className="text-xs text-gray-400">ID: {q.id}</span>
                                        </div>
                                        <div 
                                            className="text-sm text-gray-700 line-clamp-2 prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{
                                                __html: enhanceQuestionHtml(q.content, { useQuestionImageThumbnail: true }),
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-xl">
                    <div className="text-sm text-gray-500">
                        {selectedIds.size} soal dipilih
                    </div>
                    <div className="flex gap-2">
                         {/* Pagination */}
                        <div className="flex gap-1 mr-4">
                            <button 
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                                className="px-3 py-1.5 border rounded text-sm disabled:opacity-50"
                            >
                                Prev
                            </button>
                            <span className="px-3 py-1.5 text-sm flex items-center">{page} / {totalPages}</span>
                            <button 
                                disabled={page === totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="px-3 py-1.5 border rounded text-sm disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>

                        <button 
                            onClick={handleAdd}
                            disabled={selectedIds.size === 0}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Tambahkan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
