import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
    Plus, 
    Search, 
    FileQuestion, 
    Clock, 
    Calendar, 
    Edit, 
    Trash2,
    BookOpen,
    BarChart3,
    Users
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
    examService,
    findExamProgramBySlug,
    normalizeExamProgramCode,
} from '../../../services/exam.service';
import type { ExamPacket, ExamProgram, ExamType } from '../../../services/exam.service';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';

import { QuestionBankView } from '../../../components/teacher/exams/QuestionBankView';

type SemesterFilter = 'GANJIL' | 'GENAP' | '';

const LEGACY_ROUTE_PROGRAM_MAP: Record<string, string> = {
    '/formatif': 'FORMATIF',
    '/sbts': 'SBTS',
    '/sas': 'SAS',
    '/sat': 'SAT',
};

const PROGRAM_BADGE_CLASSES = [
    'bg-blue-50 text-blue-700 border border-blue-100',
    'bg-emerald-50 text-emerald-700 border border-emerald-100',
    'bg-amber-50 text-amber-700 border border-amber-100',
    'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100',
    'bg-cyan-50 text-cyan-700 border border-cyan-100',
];

const badgeClassByProgramCode = (raw: unknown) => {
    const normalized = normalizeExamProgramCode(raw);
    if (!normalized) return PROGRAM_BADGE_CLASSES[0];
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
        hash = (hash * 31 + normalized.charCodeAt(i)) % 100000;
    }
    return PROGRAM_BADGE_CLASSES[Math.abs(hash) % PROGRAM_BADGE_CLASSES.length];
};

const toSemesterFilter = (semester?: string | null): SemesterFilter => {
    const normalized = String(semester || '').toUpperCase();
    if (normalized === 'ODD' || normalized === 'GANJIL') return 'GANJIL';
    if (normalized === 'EVEN' || normalized === 'GENAP') return 'GENAP';
    return '';
};

const fromSemesterFilter = (semester: SemesterFilter): 'ODD' | 'EVEN' | undefined => {
    if (semester === 'GANJIL') return 'ODD';
    if (semester === 'GENAP') return 'EVEN';
    return undefined;
};

export const ExamListPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { programCode: programSlugParam } = useParams<{ programCode?: string }>();

    // Filters with persistence
    const [search, setSearch] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [subjects, setSubjects] = useState<{id: number, name: string}[]>([]);
    const [activeAcademicYear, setActiveAcademicYear] = useState<{id: number, name: string, semester?: string} | null>(null);
    const [selectedSemester, setSelectedSemester] = useState<SemesterFilter>('');
    const isBankSoal = location.pathname.includes('/bank');

    const fetchInitialData = useCallback(async () => {
        try {
            const [ayRes, assignRes] = await Promise.all([
                academicYearService.getActive(),
                teacherAssignmentService.list({ limit: 100 })
            ]);
            
            if (ayRes.data) {
                const active = ayRes.data;
                setActiveAcademicYear(active);
            }
            
            // Extract unique subjects from assignments
            const assignments = assignRes.data?.assignments || [];
            const uniqueSubjects = Array.from(new Map(assignments.map((a: { subject: { id: number; name: string } }) => [a.subject.id, a.subject])).values());
            setSubjects(uniqueSubjects as {id: number, name: string}[]);

        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const { data: examProgramsRes } = useQuery({
        queryKey: ['teacher-exam-programs', activeAcademicYear?.id],
        enabled: !!activeAcademicYear?.id && !isBankSoal,
        staleTime: 5 * 60 * 1000,
        queryFn: () =>
            examService.getPrograms({
                academicYearId: activeAcademicYear?.id,
                roleContext: 'teacher',
            }),
    });

    const teacherPrograms = useMemo<ExamProgram[]>(() => {
        return (examProgramsRes?.data?.programs || [])
            .filter((program: ExamProgram) => Boolean(program?.isActive) && Boolean(program?.showOnTeacherMenu))
            .sort((a: ExamProgram, b: ExamProgram) => Number(a.order || 0) - Number(b.order || 0));
    }, [examProgramsRes]);

    const legacyRouteProgramCode = useMemo(() => {
        const segment = Object.keys(LEGACY_ROUTE_PROGRAM_MAP).find((pathPart) => location.pathname.includes(pathPart));
        if (!segment) return null;
        return LEGACY_ROUTE_PROGRAM_MAP[segment];
    }, [location.pathname]);

    const selectedProgram = useMemo<ExamProgram | null>(() => {
        if (isBankSoal) return null;

        if (programSlugParam) {
            return findExamProgramBySlug(teacherPrograms, programSlugParam) || null;
        }

        if (legacyRouteProgramCode) {
            const normalizedLegacyCode = normalizeExamProgramCode(legacyRouteProgramCode);
            return (
                teacherPrograms.find(
                    (program) => normalizeExamProgramCode(program.code) === normalizedLegacyCode,
                ) || null
            );
        }

        return teacherPrograms[0] || null;
    }, [isBankSoal, programSlugParam, teacherPrograms, legacyRouteProgramCode]);

    const selectedProgramCode = useMemo(
        () => normalizeExamProgramCode(selectedProgram?.code),
        [selectedProgram?.code],
    );
    const selectedProgramBaseType = selectedProgram?.baseType as ExamType | undefined;
    const isSemesterLockedByProgram = Boolean(selectedProgram?.fixedSemester);

    useEffect(() => {
        if (isBankSoal) return;
        if (!selectedProgramCode) return;

        const storageKey = `exam_filters_program_${selectedProgramCode}`;
        let storedSemester: SemesterFilter = '';
        let storedSubject = '';

        try {
            const storedRaw = sessionStorage.getItem(storageKey);
            if (storedRaw) {
                const parsed = JSON.parse(storedRaw);
                storedSemester = toSemesterFilter(parsed?.semester);
                storedSubject = String(parsed?.subjectId || '');
            }
        } catch {
            storedSemester = '';
            storedSubject = '';
        }

        const fixedSemester = toSemesterFilter(selectedProgram?.fixedSemester);
        const semesterFromAcademicYear = toSemesterFilter(activeAcademicYear?.semester);
        const nextSemester = fixedSemester || storedSemester || semesterFromAcademicYear || '';

        setSelectedSemester(nextSemester);
        setSelectedSubject(storedSubject);
    }, [isBankSoal, selectedProgramCode, selectedProgram?.fixedSemester, activeAcademicYear?.semester]);

    useEffect(() => {
        if (isBankSoal || !selectedProgramCode) return;
        sessionStorage.setItem(
            `exam_filters_program_${selectedProgramCode}`,
            JSON.stringify({
                semester: selectedSemester,
                subjectId: selectedSubject,
            }),
        );
    }, [isBankSoal, selectedProgramCode, selectedSemester, selectedSubject]);

    const getPageTitle = () => {
        if (isBankSoal) return 'Bank Soal';
        if (!selectedProgram) return 'Manajemen Ujian';
        return `Ujian ${selectedProgram.label || selectedProgram.code}`;
    };

    const programLabelByCode = useMemo(() => {
        const map = new Map<string, string>();
        teacherPrograms.forEach((program) => {
            const code = normalizeExamProgramCode(program.code);
            if (!code) return;
            map.set(code, String(program.label || program.code));
        });
        return map;
    }, [teacherPrograms]);

    const baseTypeFallbackLabel = useMemo(() => {
        const map = new Map<string, string>();
        teacherPrograms.forEach((program) => {
            const base = String(program.baseType || '').toUpperCase();
            if (!base || map.has(base)) return;
            map.set(base, String(program.label || program.code));
        });
        return map;
    }, [teacherPrograms]);

    const resolvePacketLabel = useCallback(
        (packet: ExamPacket) => {
            const normalizedProgram = normalizeExamProgramCode(packet.programCode);
            if (normalizedProgram && programLabelByCode.has(normalizedProgram)) {
                return programLabelByCode.get(normalizedProgram) as string;
            }
            const normalizedType = String(packet.type || '').toUpperCase();
            return baseTypeFallbackLabel.get(normalizedType) || normalizedType || '-';
        },
        [programLabelByCode, baseTypeFallbackLabel],
    );

    // Use Query for fetching packets
    const { data: packets = [], isLoading, refetch: refetchPackets } = useQuery({
        queryKey: ['exam-packets', { 
            type: selectedProgramBaseType,
            programCode: selectedProgramCode,
            subjectId: selectedSubject, 
            academicYearId: activeAcademicYear?.id, 
            semester: selectedSemester 
        }],
        queryFn: async () => {
            if (!activeAcademicYear || isBankSoal || !selectedProgram) return [];
            
            const res = await examService.getPackets({
                type: selectedProgramBaseType,
                programCode: selectedProgram.code,
                subjectId: selectedSubject ? parseInt(selectedSubject) : undefined,
                academicYearId: activeAcademicYear.id,
                semester: fromSemesterFilter(selectedSemester),
                limit: 100
            });
            // Handle both array response and object wrapper
            return (Array.isArray(res.data) ? res.data : (res.data?.packets || [])) as ExamPacket[];
        },
        enabled: !!activeAcademicYear && !isBankSoal && !!selectedProgram && !!selectedSemester
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
                {!isBankSoal && selectedProgram && (
                    <button 
                        onClick={() => {
                            const finalType = selectedProgramBaseType || ('FORMATIF' as ExamType);
                            navigate('/teacher/exams/create', {
                                state: {
                                    type: finalType,
                                    programCode: selectedProgram?.code || finalType,
                                    programLabel: selectedProgram?.label || finalType,
                                    fixedSemester: selectedProgram?.fixedSemester || null,
                                },
                            });
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
                                isSemesterLockedByProgram ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                            }`}
                            value={selectedSemester}
                            onChange={(e) => setSelectedSemester(e.target.value as 'GANJIL' | 'GENAP' | '')}
                            disabled={isSemesterLockedByProgram}
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
            ) : !selectedProgram ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                    <FileQuestion className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900">Program ujian belum tersedia</h3>
                    <p className="text-gray-500 mt-1">
                        Minta Wakasek Kurikulum menambahkan konfigurasi program ujian terlebih dahulu.
                    </p>
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
                                        badgeClassByProgramCode(packet.programCode || packet.type)
                                    }`}>
                                        {resolvePacketLabel(packet)}
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
                            <div className="pt-3 border-t border-gray-100 space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <button 
                                        onClick={() => navigate(`/teacher/exams/${packet.id}/schedule`)}
                                        className="px-2 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-1 border border-blue-100"
                                    >
                                        <Calendar className="w-3 h-3" />
                                        Jadwal
                                    </button>
                                    <button 
                                        onClick={() => navigate(`/teacher/exams/${packet.id}/item-analysis`)}
                                        className="px-2 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1 border border-emerald-100"
                                    >
                                        <BarChart3 className="w-3 h-3" />
                                        Analisis
                                    </button>
                                    <button
                                        onClick={() => navigate(`/teacher/exams/${packet.id}/submissions`)}
                                        className="px-2 py-1.5 bg-violet-50 text-violet-700 text-xs font-bold rounded-lg hover:bg-violet-600 hover:text-white transition-all flex items-center justify-center gap-1 border border-violet-100"
                                    >
                                        <Users className="w-3 h-3" />
                                        Submisi
                                    </button>
                                </div>

                                <div className="flex items-center justify-end gap-1">
                                    <button 
                                        onClick={() =>
                                            navigate(`/teacher/exams/${packet.id}/edit`, {
                                                state: {
                                                    type: packet.type,
                                                    programCode: packet.programCode || packet.type,
                                                    programLabel: resolvePacketLabel(packet),
                                                },
                                            })
                                        }
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
