import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
    Plus, 
    Search, 
    FileQuestion, 
    Clock, 
    Calendar, 
    Edit, 
    Trash2,
    BookOpen
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { examService } from '../../../services/exam.service';
import type { ExamPacket, ExamType } from '../../../services/exam.service';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';

import { QuestionBankView } from '../../../components/teacher/exams/QuestionBankView';

export const ExamListPage = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Determine exam type from URL
    const getExamTypeFromUrl = useCallback((): ExamType | undefined => {
        if (location.pathname.includes('/formatif')) return 'FORMATIF';
        if (location.pathname.includes('/sbts')) return 'SBTS';
        if (location.pathname.includes('/sas-sat')) {
            // Logic handled in effect based on semester selection
            return undefined;
        }
        if (location.pathname.includes('/sas')) return 'SAS'; // Legacy fallback
        if (location.pathname.includes('/sat')) return 'SAT'; // Legacy fallback
        return undefined; // Bank Soal or mixed
    }, [location.pathname]);

    // Filters with persistence
    const [search, setSearch] = useState('');
    
    const [selectedSubject, setSelectedSubject] = useState(() => {
        const type = getExamTypeFromUrl();
        if (type && !location.pathname.includes('/sas') && !location.pathname.includes('/sat')) {
            try {
                const stored = sessionStorage.getItem(`exam_filters_${type}`);
                if (stored) return JSON.parse(stored).subjectId || '';
            } catch (e) {
                return '';
            }
        }
        return '';
    });

    const [subjects, setSubjects] = useState<{id: number, name: string}[]>([]);
    const [activeAcademicYear, setActiveAcademicYear] = useState<{id: number, name: string, semester?: string} | null>(null);
    
    const [selectedSemester, setSelectedSemester] = useState<'GANJIL' | 'GENAP' | ''>(() => {
        // Enforce SAS/SAT defaults immediately
        if (location.pathname.includes('/sas') && !location.pathname.includes('/sas-sat')) return 'GANJIL';
        if (location.pathname.includes('/sat') && !location.pathname.includes('/sas-sat')) return 'GENAP';
        
        const type = getExamTypeFromUrl();
        if (type) {
            try {
                const stored = sessionStorage.getItem(`exam_filters_${type}`);
                if (stored) return JSON.parse(stored).semester || '';
            } catch (e) {
                return '';
            }
        }
        return '';
    });

    const [examType, setExamType] = useState<ExamType | undefined>(getExamTypeFromUrl());
    const isBankSoal = location.pathname.includes('/bank');
    const isSasSat = location.pathname.includes('/sas-sat');
    const isSas = location.pathname.includes('/sas') && !isSasSat;
    const isSat = location.pathname.includes('/sat') && !isSasSat;

    useEffect(() => {
        if (isSasSat) {
            setExamType(selectedSemester === 'GANJIL' ? 'SAS' : 'SAT');
        } else if (!isSasSat) {
            setExamType(getExamTypeFromUrl());
        }
    }, [location.pathname, selectedSemester, isSasSat, getExamTypeFromUrl]);

    // Enforce semester based on route for separate SAS/SAT menus
    useEffect(() => {
        if (isSas) {
            setSelectedSemester('GANJIL');
        } else if (isSat) {
            setSelectedSemester('GENAP');
        } else if (!isSasSat) {
            // Restore from storage or reset to empty
            // This runs when switching exam types
            const currentType = getExamTypeFromUrl();
            if (currentType) {
                try {
                    const stored = sessionStorage.getItem(`exam_filters_${currentType}`);
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        setSelectedSemester(parsed.semester || '');
                        setSelectedSubject(parsed.subjectId || '');
                        return;
                    }
                } catch (e) {
                    // Ignore error
                }
            }
            // If no storage found, reset to empty to require selection
            setSelectedSemester('');
            setSelectedSubject('');
        }
    }, [isSas, isSat, isSasSat, getExamTypeFromUrl]);

    // Save filters to session storage
    useEffect(() => {
        if (examType && !isSasSat && !isBankSoal) {
            sessionStorage.setItem(`exam_filters_${examType}`, JSON.stringify({
                semester: selectedSemester,
                subjectId: selectedSubject
            }));
        }
    }, [examType, selectedSemester, selectedSubject, isSasSat, isBankSoal]);

    const getPageTitle = () => {
        if (isBankSoal) return 'Bank Soal';
        switch (examType) {
            case 'FORMATIF': return 'Ujian Formatif (Kuis/UH)';
            case 'SBTS': return 'Sumatif Tengah Semester (STS)';
            case 'SAS': return 'Sumatif Akhir Semester (SAS)';
            case 'SAT': return 'Sumatif Akhir Tahun (SAT)';
            default: return 'Manajemen Ujian';
        }
    };

    const fetchInitialData = useCallback(async () => {
        try {
            const [ayRes, assignRes] = await Promise.all([
                academicYearService.getActive(),
                teacherAssignmentService.list({ limit: 100 })
            ]);
            
            if (ayRes.data) {
                const active = ayRes.data;
                setActiveAcademicYear(active);
                
                // Initialize selectedSemester based on active year
                // Try to detect from semester field or name
                const isGenap = active.semester === 'EVEN' || active.name.toLowerCase().includes('genap');
                
                if (isSasSat) {
                    setSelectedSemester(isGenap ? 'GENAP' : 'GANJIL');
                } else {
                    // Logic moved to effect/useState init
                }
            }
            
            // Extract unique subjects from assignments
            const assignments = assignRes.data?.assignments || [];
            const uniqueSubjects = Array.from(new Map(assignments.map((a: { subject: { id: number; name: string } }) => [a.subject.id, a.subject])).values());
            setSubjects(uniqueSubjects as {id: number, name: string}[]);

        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    }, [isSasSat]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    // Use Query for fetching packets
    const { data: packets = [], isLoading, refetch: refetchPackets } = useQuery({
        queryKey: ['exam-packets', { 
            type: examType, 
            subjectId: selectedSubject, 
            academicYearId: activeAcademicYear?.id, 
            semester: selectedSemester 
        }],
        queryFn: async () => {
            if (!activeAcademicYear || isBankSoal) return [];
            
            const res = await examService.getPackets({
                type: examType,
                subjectId: selectedSubject ? parseInt(selectedSubject) : undefined,
                academicYearId: activeAcademicYear.id,
                semester: selectedSemester === 'GANJIL' ? 'ODD' : (selectedSemester === 'GENAP' ? 'EVEN' : undefined),
                limit: 100
            });
            // Handle both array response and object wrapper
            return (Array.isArray(res.data) ? res.data : (res.data?.packets || [])) as ExamPacket[];
        },
        enabled: !!activeAcademicYear && !isBankSoal && !!selectedSemester
    });

    // Handle delete with refetch
    const handleDelete = async (id: number) => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus paket ujian ini?')) return;
        
        try {
            await examService.deletePacket(id);
            toast.success('Paket ujian berhasil dihapus');
            refetchPackets();
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Gagal menghapus paket ujian');
        }
    };

    /* 
    // Old manual fetch
    const fetchPackets = useCallback(async () => {
        if (!activeAcademicYear || isBankSoal) return;
        
        setLoading(true);
        try {
            const res = await examService.getPackets({
                type: examType,
                subjectId: selectedSubject ? parseInt(selectedSubject) : undefined,
                academicYearId: activeAcademicYear.id,
                semester: selectedSemester === 'GANJIL' ? 'ODD' : 'EVEN',
                limit: 100
            });
            // Handle both array response and object wrapper
            const packetsData = Array.isArray(res.data) ? res.data : (res.data?.packets || []);
            setPackets(packetsData);
        } catch (error) {
            console.error('Error fetching packets:', error);
            toast.error('Gagal memuat data ujian');
        } finally {
            setLoading(false);
        }
    }, [activeAcademicYear, examType, selectedSubject, isBankSoal]);

    useEffect(() => {
        fetchPackets();
    }, [fetchPackets]);
    */

    if (isBankSoal) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{getPageTitle()}</h1>
                        <p className="text-gray-600">Kumpulan soal untuk referensi dan penggunaan ulang</p>
                    </div>
                </div>
                <QuestionBankView subjects={subjects} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">{getPageTitle()}</h1>
                    <p className="text-gray-600">Kelola paket soal dan jadwal ujian</p>
                </div>
                {!isBankSoal && (
                    <button 
                        onClick={() => {
                            const currentExamType = getExamTypeFromUrl();
                            const finalExamType = currentExamType || (selectedSemester === 'GANJIL' ? 'SAS' : 'SAT');
                            navigate('/teacher/exams/create', { state: { type: finalExamType } });
                        }}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-normal"
                    >
                        <Plus className="w-4 h-4" />
                        Buat Ujian Baru
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            id="search-exam"
                            name="search"
                            type="text" 
                            placeholder="Cari judul ujian..." 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    
                    <div className="w-full md:w-48">
                        <select 
                            id="filter-semester"
                            name="semester"
                            className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium ${
                                (isSas || isSat) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                            }`}
                            value={selectedSemester}
                            onChange={(e) => setSelectedSemester(e.target.value as 'GANJIL' | 'GENAP' | '')}
                            disabled={isSas || isSat}
                        >
                            <option value="">Pilih Semester</option>
                            <option value="GANJIL">Semester Ganjil</option>
                            <option value="GENAP">Semester Genap</option>
                        </select>
                    </div>

                    <div className="w-full md:w-64">
                        <select 
                            id="filter-subject"
                            name="subject"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                        >
                            <option value="">Pilih Mata Pelajaran</option>
                            {subjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : !selectedSemester ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900">Pilih Semester</h3>
                    <p className="text-gray-500 mt-1">Silakan pilih semester terlebih dahulu untuk menampilkan data ujian</p>
                </div>
            ) : packets.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                    <FileQuestion className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900">Belum ada paket ujian</h3>
                    <p className="text-gray-500 mt-1">Buat paket ujian baru untuk memulai</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {packets.filter((p: ExamPacket) => p.title.toLowerCase().includes(search.toLowerCase())).map((packet: ExamPacket) => (
                        <div 
                            key={packet.id} 
                            className="group bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-4 hover:border-blue-300 hover:shadow-lg transition-all relative overflow-hidden"
                        >
                            {/* Decorative Background Pattern */}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-gray-50 to-transparent rounded-bl-full -mr-8 -mt-8 opacity-50 group-hover:from-blue-50 transition-colors"></div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                        packet.type === 'FORMATIF' ? 'bg-green-50 text-green-700 border border-green-100' :
                                        packet.type === 'SBTS' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                                        packet.type === 'SAS' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                        'bg-purple-50 text-purple-700 border border-purple-100'
                                    }`}>
                                        {packet.type}
                                    </span>
                                </div>
                                <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-3 line-clamp-2 min-h-[40px]">
                                    {packet.title}
                                </h3>
                                
                                {/* Stats Row */}
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                    <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                        <Clock className="w-3 h-3 text-orange-500" />
                                        <span className="font-semibold text-gray-700">{packet.duration}</span>
                                        <span className="text-[10px] text-gray-400">m</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                        <span className="text-[10px] text-gray-400 uppercase font-bold">KKM</span>
                                        <span className="font-semibold text-gray-700">{packet.kkm}</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                        <BookOpen className="w-3 h-3 text-blue-500" />
                                        <span className="truncate max-w-[80px]">{packet.subject?.name}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                                <button 
                                    onClick={() => navigate(`/teacher/exams/${packet.id}/schedule`)}
                                    className="flex-1 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-1 border border-blue-100"
                                >
                                    <Calendar className="w-3 h-3" />
                                    Jadwal
                                </button>
                                
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => navigate(`/teacher/exams/${packet.id}/edit`, { state: { type: packet.type } })}
                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-100 transition-all"
                                        title="Edit Soal"
                                    >
                                        <Edit className="w-3 h-3" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(packet.id)}
                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all"
                                        title="Hapus"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
