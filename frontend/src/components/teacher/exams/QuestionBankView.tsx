import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Trash2 } from 'lucide-react';
import { examService } from '../../../services/exam.service';
import type { Question } from '../../../services/exam.service';
import { toast } from 'react-hot-toast';
import { enhanceQuestionHtml } from '../../../utils/questionMedia';
import { ConfirmationModal } from '../../common/ConfirmationModal';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';

interface QuestionBankViewProps {
    subjects: { id: number; name: string }[];
}

export const QuestionBankView = ({ subjects }: QuestionBankViewProps) => {
    // State removed in favor of useQuery
    // const [questions, setQuestions] = useState<Question[]>([]);
    // const [loading, setLoading] = useState(false);
    const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();

    // Filters
    const [filters, setFilters] = useState({
        subjectId: '',
        semester: '',
        type: '',
        search: ''
    });

    // Active Search (triggered on submit)
    const [activeSearch, setActiveSearch] = useState('');

    // Pagination
    const [page, setPage] = useState(1);
    const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
    const [deletingQuestionId, setDeletingQuestionId] = useState<number | string | null>(null);
    // const [totalPages, setTotalPages] = useState(1); // Derived from query data

    // React Query for fetching questions
    const { data: queryData, isLoading, refetch } = useQuery({
        queryKey: ['bank-questions', { page, ...filters, academicYearId: activeAcademicYear?.id ?? null, search: activeSearch }],
        enabled: Boolean(activeAcademicYear?.id),
        queryFn: async () => {
            const res = await examService.getQuestions({
                page,
                limit: 20,
                subjectId: filters.subjectId ? parseInt(filters.subjectId) : undefined,
                academicYearId: activeAcademicYear?.id ? Number(activeAcademicYear.id) : undefined,
                semester: filters.semester || undefined,
                type: filters.type || undefined,
                search: activeSearch // Use activeSearch
            });
            return res.data;
        }
    });

    const questions: Question[] = queryData?.questions || (Array.isArray(queryData) ? queryData : []) || [];
    const totalPages = queryData?.meta?.totalPages || 1;

    // Manual fetch removed in favor of useQuery
    /*
    useEffect(() => {
        fetchQuestions();
    }, [page, filters.subjectId, filters.academicYearId, filters.semester, filters.type]);

    const fetchQuestions = async () => {
        // ...
    };
    */
    
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setActiveSearch(filters.search);
    };

    const handleDelete = async () => {
        if (!questionToDelete) return;
        setDeletingQuestionId(questionToDelete.id);
        try {
            await examService.deleteQuestion(questionToDelete.id);
            toast.success('Soal bank berhasil dihapus.');
            setQuestionToDelete(null);
            await refetch();
        } catch (error) {
            console.error(error);
            const message =
                (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Gagal menghapus soal.';
            toast.error(message);
        } finally {
            setDeletingQuestionId(null);
        }
    };

    return (
        <div className="space-y-6">

            {!isLoadingActiveAcademicYear && !activeAcademicYear?.id ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar bank soal tidak ambigu.
                </div>
            ) : null}

            {/* Filters Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                    {/* Search */}
                    <form onSubmit={handleSearch} className="flex-1 min-w-[200px] relative">
                        <input 
                            type="text"
                            placeholder="Cari konten soal..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            value={filters.search}
                            onChange={e => setFilters({...filters, search: e.target.value})}
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    </form>

                    {/* Filters */}
                    <div className="flex gap-2 flex-wrap">
                         <select 
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            value={filters.subjectId}
                            onChange={e => {
                                setFilters({...filters, subjectId: e.target.value});
                                setPage(1);
                            }}
                        >
                            <option value="">Semua Mapel</option>
                            {subjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>

                        <select 
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                            <option value="COMPLEX_MULTIPLE_CHOICE">PG Kompleks</option>
                            <option value="MATRIX_SINGLE_CHOICE">Pilihan Ganda Grid</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Questions List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : questions.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Search className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">Belum ada soal</h3>
                        <p className="text-gray-500 mt-1">Gunakan filter atau buat soal baru di menu Ujian</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {questions.map((q: Question) => (
                            <div key={q.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                <div className="flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                q.type === 'ESSAY' ? 'bg-purple-100 text-purple-700' :
                                                q.type === 'MATRIX_SINGLE_CHOICE' ? 'bg-cyan-100 text-cyan-700' :
                                                q.type === 'MULTIPLE_CHOICE' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {q.type === 'MATRIX_SINGLE_CHOICE' ? 'PILIHAN GANDA GRID' : q.type.replace(/_/g, ' ')}
                                            </span>
                                            {/* Score badge if needed */}
                                            <span className="text-xs text-gray-400">ID: {q.id}</span>
                                        </div>
                                        
                                        <div 
                                            className="text-sm text-gray-800 line-clamp-2 prose prose-sm max-w-none mb-2"
                                            dangerouslySetInnerHTML={{
                                                __html: enhanceQuestionHtml(q.content, { useQuestionImageThumbnail: true }),
                                            }}
                                        />

                                        {/* Options Preview (for MC) */}
                                        {q.options && q.options.length > 0 && (
                                            <div className="text-xs text-gray-500 pl-4 border-l-2 border-gray-200 space-y-1 mt-2">
                                                {q.options.slice(0, 2).map((opt: {id: string, content: string, isCorrect: boolean}, idx: number) => (
                                                    <div key={opt.id} className="flex items-center gap-2">
                                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[10px] ${opt.isCorrect ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white border-gray-300'}`}>
                                                            {String.fromCharCode(65 + idx)}
                                                        </span>
                                                        <span className={opt.isCorrect ? 'font-medium text-green-700' : ''} dangerouslySetInnerHTML={{ __html: opt.content.substring(0, 50) + (opt.content.length > 50 ? '...' : '') }} />
                                                    </div>
                                                ))}
                                                {q.options.length > 2 && <div className="text-[10px] text-gray-400 pl-6">+{q.options.length - 2} opsi lainnya</div>}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* 
                                        <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Lihat Detail">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        */}
                                        {/* Currently we don't have direct Edit for Bank Soal items independent of Exam Packet in the frontend logic easily without a modal. 
                                            But we can add it later. For now, just Delete.
                                        */}
                                        <button 
                                            onClick={() => setQuestionToDelete(q)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                                            title="Hapus"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
             
             {/* Pagination Footer */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    <button 
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                    >
                        Prev
                    </button>
                    <span className="px-3 py-1.5 text-sm flex items-center bg-white border border-gray-300 rounded-md">
                        {page} / {totalPages}
                    </span>
                    <button 
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                    >
                        Next
                    </button>
                </div>
            )}

            <ConfirmationModal
                open={Boolean(questionToDelete)}
                title="Hapus Soal Bank"
                message="Apakah Anda yakin ingin menghapus soal ini dari bank soal? Tindakan ini tidak memengaruhi hasil ujian yang sudah tersimpan."
                confirmLabel={deletingQuestionId !== null ? 'Menghapus...' : 'Ya, Hapus'}
                cancelLabel="Batal"
                confirmVariant="danger"
                confirmDisabled={deletingQuestionId !== null}
                onCancel={() => {
                    if (deletingQuestionId !== null) return;
                    setQuestionToDelete(null);
                }}
                onConfirm={handleDelete}
            />
        </div>
    );
};
