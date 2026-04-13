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
    BookOpen,
    BarChart3,
    Users,
    X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
    examService,
    findExamProgramBySlug,
    normalizeExamProgramCode,
} from '../../../services/exam.service';
import type { ExamPacket, ExamProgram, ExamSchedule, ExamType } from '../../../services/exam.service';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';

import { QuestionBankView } from '../../../components/teacher/exams/QuestionBankView';

type SemesterFilter = 'GANJIL' | 'GENAP' | '';
type CreateExamInfoDraft = {
    title: string;
    assignmentId: string;
    subjectId: string;
    semester: 'ODD' | 'EVEN';
    duration: string;
    instructions: string;
};

type ScheduleDraftRow = {
    classId: number;
    className: string;
    startTime: string;
    endTime: string;
    selected: boolean;
    existingScheduleId?: number;
};

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

const CURRICULUM_EXAM_MANAGER_LABEL = 'Wakasek Kurikulum / Sekretaris Kurikulum';

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

const extractStructuredTitleSuffix = (rawTitle?: string | null): string => {
    const title = String(rawTitle || '').trim();
    if (!title.includes('•')) return '';
    const segments = title
        .split('•')
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length < 3) return '';

    const dateTokenIndex = segments.findIndex((segment) => /^\d{4}-\d{2}-\d{2}$/.test(segment));
    if (dateTokenIndex >= 0) {
        return segments.slice(dateTokenIndex).join(' • ');
    }
    return segments.slice(2).join(' • ');
};

const toDateTimeLocalValue = (value?: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const resolveProgramPacketType = (program?: ExamProgram | null): ExamType => {
    const baseType = normalizeExamProgramCode(program?.baseType || program?.baseTypeCode);
    if (baseType) return baseType as ExamType;
    const componentType = normalizeExamProgramCode(program?.gradeComponentTypeCode || program?.gradeComponentType);
    if (componentType === 'FORMATIVE') return 'FORMATIF';
    return 'FORMATIF';
};

const normalizeClassLevelToken = (raw?: string | null): string => {
    const value = String(raw || '').trim().toUpperCase();
    if (!value) return '';
    if (value.startsWith('XII')) return 'XII';
    if (value.startsWith('XI')) return 'XI';
    if (value.startsWith('X')) return 'X';
    return value;
};

const buildAssignmentDisplayLabel = (assignment: TeacherAssignment): string => {
    const subjectName = String(assignment.subject?.name || '-').trim();
    const className = String(assignment.class?.name || '-').trim();
    const teacherName = String(assignment.teacher?.name || '-').trim();
    return `${subjectName} — ${className} — ${teacherName}`;
};

const canTeacherDirectSchedulePacket = (packet?: Pick<ExamPacket, 'programCode' | 'type'> | null) => {
    const normalized = normalizeExamProgramCode(packet?.programCode || packet?.type);
    return ['FORMATIF', 'FORMATIVE', 'UH', 'ULANGAN_HARIAN'].includes(normalized);
};

export const ExamListPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { programCode: programSlugParam, legacyProgramCode } = useParams<{
      programCode?: string;
      legacyProgramCode?: string;
    }>();

    // Filters with persistence
    const [search, setSearch] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [subjects, setSubjects] = useState<{id: number, name: string}[]>([]);
    const [assignmentOptions, setAssignmentOptions] = useState<TeacherAssignment[]>([]);
    const [activeAcademicYear, setActiveAcademicYear] = useState<{id: number, name: string, semester?: string} | null>(null);
    const [selectedSemester, setSelectedSemester] = useState<SemesterFilter>('');
    const [isCreateInfoModalOpen, setIsCreateInfoModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [schedulePacket, setSchedulePacket] = useState<ExamPacket | null>(null);
    const [scheduleRows, setScheduleRows] = useState<ScheduleDraftRow[]>([]);
    const [isScheduleLoading, setIsScheduleLoading] = useState(false);
    const [isScheduleSaving, setIsScheduleSaving] = useState(false);
    const [createExamInfoDraft, setCreateExamInfoDraft] = useState<CreateExamInfoDraft>({
        title: '',
        assignmentId: '',
        subjectId: '',
        semester: 'ODD',
        duration: '',
        instructions: '',
    });
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
            const assignments = (assignRes.data?.assignments || []) as TeacherAssignment[];
            setAssignmentOptions(assignments);
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

        const requestedProgramSlug = String(programSlugParam || legacyProgramCode || '').trim();
        if (requestedProgramSlug) {
            return findExamProgramBySlug(teacherPrograms, requestedProgramSlug) || null;
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
    }, [isBankSoal, programSlugParam, legacyProgramCode, teacherPrograms, legacyRouteProgramCode]);

    const selectedProgramCode = useMemo(
        () => normalizeExamProgramCode(selectedProgram?.code),
        [selectedProgram?.code],
    );
    const selectedProgramBaseType = useMemo(
        () => (selectedProgram ? resolveProgramPacketType(selectedProgram) : undefined),
        [selectedProgram],
    );
    const isSemesterLockedByProgram = Boolean(selectedProgram?.fixedSemester);
    const allowedSubjectIdsByProgram = useMemo(() => {
        const ids = Array.isArray(selectedProgram?.allowedSubjectIds) ? selectedProgram?.allowedSubjectIds : [];
        return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0));
    }, [selectedProgram?.allowedSubjectIds]);
    const allowedClassLevelsByProgram = useMemo(() => {
        const levels = Array.isArray(selectedProgram?.targetClassLevels) ? selectedProgram?.targetClassLevels : [];
        return new Set(
            levels
                .map((level) => normalizeClassLevelToken(level))
                .filter((level) => Boolean(level)),
        );
    }, [selectedProgram?.targetClassLevels]);
    const filteredAssignmentsByProgram = useMemo(() => {
        if (!selectedProgram) return assignmentOptions;
        return assignmentOptions.filter((assignment) => {
            const subjectAllowed =
                allowedSubjectIdsByProgram.size === 0 ||
                allowedSubjectIdsByProgram.has(Number(assignment.subject?.id));
            const assignmentLevel = normalizeClassLevelToken(assignment.class?.level || assignment.class?.name);
            const classLevelAllowed =
                allowedClassLevelsByProgram.size === 0 ||
                (assignmentLevel ? allowedClassLevelsByProgram.has(assignmentLevel) : true);
            return subjectAllowed && classLevelAllowed;
        });
    }, [selectedProgram, assignmentOptions, allowedSubjectIdsByProgram, allowedClassLevelsByProgram]);
    const filteredSubjects = useMemo(() => {
        if (filteredAssignmentsByProgram.length > 0) {
            return Array.from(
                new Map(
                    filteredAssignmentsByProgram.map((assignment) => [assignment.subject.id, assignment.subject]),
                ).values(),
            ) as { id: number; name: string }[];
        }
        if (!selectedProgram || allowedSubjectIdsByProgram.size === 0) return subjects;
        return subjects.filter((subject) => allowedSubjectIdsByProgram.has(subject.id));
    }, [filteredAssignmentsByProgram, allowedSubjectIdsByProgram, selectedProgram, subjects]);

    const openCreateInfoModal = () => {
        if (!selectedProgram) {
            toast.error('Program ujian belum dipilih');
            return;
        }
        if (filteredAssignmentsByProgram.length === 0) {
            toast.error('Program ini belum memiliki assignment mapel-kelas yang diizinkan.');
            return;
        }

        const fixedSemester = selectedProgram.fixedSemester;
        const semesterFromFilter = fromSemesterFilter(selectedSemester);
        const assignmentFromDraft = filteredAssignmentsByProgram.find(
            (assignment) => String(assignment.id) === String(createExamInfoDraft.assignmentId),
        );
        const assignmentFromFilterSubject =
            selectedSubject
                ? filteredAssignmentsByProgram.find(
                      (assignment) => String(assignment.subject?.id) === String(selectedSubject),
                  )
                : undefined;
        const draftMatchesSelectedSubject =
            !selectedSubject ||
            String(assignmentFromDraft?.subject?.id || '') === String(selectedSubject);
        const fallbackAssignment =
            assignmentFromFilterSubject ||
            (draftMatchesSelectedSubject ? assignmentFromDraft : undefined) ||
            filteredAssignmentsByProgram[0];

        setCreateExamInfoDraft((prev) => ({
            ...prev,
            assignmentId: String(fallbackAssignment?.id || ''),
            subjectId: String(fallbackAssignment?.subject?.id || ''),
            semester: fixedSemester || semesterFromFilter || prev.semester || 'ODD',
        }));
        setIsCreateInfoModalOpen(true);
    };

    const handleCreateExamFromModal = () => {
        if (!selectedProgram) {
            toast.error('Program ujian tidak ditemukan');
            return;
        }
        if (!createExamInfoDraft.title.trim()) {
            toast.error('Judul ujian wajib diisi');
            return;
        }
        const selectedAssignment = filteredAssignmentsByProgram.find(
            (assignment) => String(assignment.id) === String(createExamInfoDraft.assignmentId),
        );
        if (!selectedAssignment) {
            toast.error('Assignment mapel-kelas wajib dipilih');
            return;
        }

        const resolvedSubjectId = Number(selectedAssignment.subject?.id);
        if (!Number.isFinite(resolvedSubjectId) || resolvedSubjectId <= 0) {
            toast.error('Mapel assignment tidak valid');
            return;
        }

        const duration = Number(createExamInfoDraft.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
            toast.error('Durasi ujian wajib diisi');
            return;
        }

        const finalType = selectedProgramBaseType || resolveProgramPacketType(selectedProgram);
        navigate('/teacher/exams/create', {
            state: {
                type: finalType,
                programCode: selectedProgram.code || '',
                programLabel: selectedProgram.label || selectedProgram.code || finalType,
                fixedSemester: selectedProgram.fixedSemester || null,
                packetDraft: {
                    title: createExamInfoDraft.title.trim(),
                    teacherAssignmentId: Number(selectedAssignment.id),
                    subjectId: resolvedSubjectId,
                    semester: createExamInfoDraft.semester,
                    duration,
                    instructions: createExamInfoDraft.instructions,
                },
            },
        });
        setIsCreateInfoModalOpen(false);
    };

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
        const nextSemester = fixedSemester || semesterFromAcademicYear || storedSemester || '';

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

    useEffect(() => {
        if (filteredSubjects.length === 0) {
            setSelectedSubject('');
            setCreateExamInfoDraft((prev) => ({ ...prev, assignmentId: '', subjectId: '' }));
            return;
        }
        if (selectedSubject && !filteredSubjects.some((subject) => String(subject.id) === String(selectedSubject))) {
            setSelectedSubject('');
        }
        setCreateExamInfoDraft((prev) => {
            const currentAssignment = filteredAssignmentsByProgram.find(
                (assignment) => String(assignment.id) === String(prev.assignmentId),
            );
            const currentSubjectId = String(currentAssignment?.subject?.id || prev.subjectId || '');
            const subjectStillVisible = currentSubjectId
                ? filteredSubjects.some((subject) => String(subject.id) === currentSubjectId)
                : false;
            const assignmentMatchesSelectedSubject =
                !selectedSubject || String(currentAssignment?.subject?.id || '') === String(selectedSubject);

            if (subjectStillVisible && assignmentMatchesSelectedSubject) return prev;

            const fallbackAssignment =
                (selectedSubject
                    ? filteredAssignmentsByProgram.find(
                          (assignment) => String(assignment.subject?.id) === String(selectedSubject),
                      )
                    : undefined) || filteredAssignmentsByProgram[0];

            return {
                ...prev,
                assignmentId: String(fallbackAssignment?.id || ''),
                subjectId: String(fallbackAssignment?.subject?.id || ''),
            };
        });
    }, [filteredSubjects, filteredAssignmentsByProgram, selectedSubject]);

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

    const resolvePacketDisplayTitle = useCallback(
        (packet: ExamPacket) => {
            const programLabel = resolvePacketLabel(packet);
            const subjectName = String(packet.subject?.name || '').trim();
            const rawTitle = String(packet.title || '').trim();
            const titleSuffix = extractStructuredTitleSuffix(rawTitle);

            if (rawTitle.includes('•')) {
                return [programLabel, subjectName || 'Mata Pelajaran', titleSuffix]
                    .filter(Boolean)
                    .join(' • ');
            }
            if (!rawTitle) {
                return [programLabel, subjectName || 'Mata Pelajaran'].join(' • ');
            }
            return rawTitle;
        },
        [resolvePacketLabel],
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

    const filteredPackets = useMemo(() => {
        const keyword = search.toLowerCase().trim();
        if (!keyword) return packets;
        return packets.filter((packet: ExamPacket) => {
            const haystack = [
                resolvePacketDisplayTitle(packet),
                packet.title,
                packet.subject?.name,
                resolvePacketLabel(packet),
            ]
                .map((item) => String(item || '').toLowerCase())
                .join(' ');
            return haystack.includes(keyword);
        });
    }, [packets, search, resolvePacketDisplayTitle, resolvePacketLabel]);

    const handleScheduleRowChange = (
        classId: number,
        field: 'selected' | 'startTime' | 'endTime',
        value: boolean | string,
    ) => {
        setScheduleRows((prev) =>
            prev.map((row) => (row.classId === classId ? { ...row, [field]: value } : row)),
        );
    };

    const openScheduleModal = async (packet: ExamPacket) => {
        if (!canTeacherDirectSchedulePacket(packet)) {
            toast.error(`Jadwal program ini diatur oleh ${CURRICULUM_EXAM_MANAGER_LABEL}.`);
            return;
        }

        setIsScheduleLoading(true);
        setSchedulePacket(packet);
        setIsScheduleModalOpen(true);

        try {
            const subjectId = Number(packet.subjectId || packet.subject?.id || 0);
            const assignmentClasses = assignmentOptions
                .filter((assignment) => Number(assignment.subject?.id) === subjectId)
                .map((assignment) => assignment.class)
                .filter((klass) => Boolean(klass?.id))
                .map((klass) => ({ id: Number(klass.id), name: String(klass.name || '-') }));

            const uniqueClasses = Array.from(new Map(assignmentClasses.map((klass) => [klass.id, klass])).values());

            const scheduleRes = await examService.getSchedules({
                packetId: Number(packet.id),
            });
            const schedulePayload = Array.isArray(scheduleRes?.data)
                ? scheduleRes.data
                : Array.isArray(scheduleRes?.data?.schedules)
                ? scheduleRes.data.schedules
                : [];
            const packetSchedules = schedulePayload as ExamSchedule[];

            const classRowsMap = new Map<number, ScheduleDraftRow>();
            uniqueClasses.forEach((klass) => {
                classRowsMap.set(klass.id, {
                    classId: klass.id,
                    className: klass.name,
                    startTime: '',
                    endTime: '',
                    selected: false,
                });
            });

            packetSchedules.forEach((schedule) => {
                const classId = Number(schedule.classId);
                const existing = classRowsMap.get(classId);
                const nextRow: ScheduleDraftRow = {
                    classId,
                    className: String(existing?.className || schedule.class?.name || `Kelas ${classId}`),
                    startTime: toDateTimeLocalValue(schedule.startTime),
                    endTime: toDateTimeLocalValue(schedule.endTime),
                    selected: true,
                    existingScheduleId: Number(schedule.id),
                };
                classRowsMap.set(classId, nextRow);
            });

            const nextRows = Array.from(classRowsMap.values()).sort((a, b) =>
                a.className.localeCompare(b.className, 'id', { numeric: true, sensitivity: 'base' }),
            );
            setScheduleRows(nextRows);
        } catch (error) {
            console.error('Error loading schedule modal:', error);
            toast.error('Gagal memuat data jadwal ujian.');
            setScheduleRows([]);
        } finally {
            setIsScheduleLoading(false);
        }
    };

    const closeScheduleModal = () => {
        if (isScheduleSaving) return;
        setIsScheduleModalOpen(false);
        setSchedulePacket(null);
        setScheduleRows([]);
        setIsScheduleLoading(false);
    };

    const handleSaveScheduleModal = async () => {
        if (!schedulePacket || !activeAcademicYear?.id) {
            toast.error('Data jadwal tidak valid.');
            return;
        }
        if (!canTeacherDirectSchedulePacket(schedulePacket)) {
            toast.error(`Jadwal program ini diatur oleh ${CURRICULUM_EXAM_MANAGER_LABEL}.`);
            return;
        }

        const selectedRows = scheduleRows.filter((row) => row.selected);
        if (selectedRows.length === 0) {
            toast.error('Pilih minimal satu kelas.');
            return;
        }

        const invalid = selectedRows.find((row) => !row.startTime || !row.endTime);
        if (invalid) {
            toast.error(`Lengkapi waktu mulai/selesai untuk ${invalid.className}.`);
            return;
        }

        setIsScheduleSaving(true);
        try {
            const isNotFound = (error: unknown) =>
                Number((error as { response?: { status?: number } })?.response?.status) === 404;

            for (const row of scheduleRows) {
                if (!row.selected) {
                    if (row.existingScheduleId) {
                        try {
                            await examService.deleteSchedule(row.existingScheduleId);
                        } catch (error) {
                            if (!isNotFound(error)) {
                                throw error;
                            }
                        }
                    }
                    continue;
                }

                const payload = {
                    startTime: new Date(row.startTime).toISOString(),
                    endTime: new Date(row.endTime).toISOString(),
                };

                if (row.existingScheduleId) {
                    try {
                        await examService.updateSchedule(row.existingScheduleId, payload);
                    } catch (error) {
                        if (!isNotFound(error)) {
                            throw error;
                        }
                        await examService.createSchedule({
                            packetId: Number(schedulePacket.id),
                            classIds: [Number(row.classId)],
                            ...payload,
                        });
                    }
                    continue;
                }

                await examService.createSchedule({
                    packetId: Number(schedulePacket.id),
                    classIds: [Number(row.classId)],
                    ...payload,
                });
            }
            toast.success('Jadwal ujian berhasil disimpan.');
            closeScheduleModal();
            refetchPackets();
        } catch (error) {
            console.error('Error saving schedule modal:', error);
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Gagal menyimpan jadwal ujian.');
        } finally {
            setIsScheduleSaving(false);
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
                {!isBankSoal && selectedProgram && canTeacherDirectSchedulePacket({
                    programCode: selectedProgram.code,
                    type: selectedProgramBaseType || '',
                }) && (
                    <button 
                        onClick={openCreateInfoModal}
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
                            {filteredSubjects.map(s => (
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
                        Minta {CURRICULUM_EXAM_MANAGER_LABEL} menambahkan konfigurasi program ujian terlebih dahulu.
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
                    {filteredPackets.map((packet: ExamPacket) => (
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
                                    {resolvePacketDisplayTitle(packet)}
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
                                <div className={`grid gap-2 ${canTeacherDirectSchedulePacket(packet) ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                    {canTeacherDirectSchedulePacket(packet) ? (
                                        <button 
                                            onClick={() => openScheduleModal(packet)}
                                            className="px-2 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-1 border border-blue-100"
                                        >
                                            <Calendar className="w-3 h-3" />
                                            Jadwal
                                        </button>
                                    ) : null}
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
                                {!canTeacherDirectSchedulePacket(packet) ? (
                                    <p className="text-[11px] text-slate-500">
                                        Jadwal program ini dibuat oleh {CURRICULUM_EXAM_MANAGER_LABEL}.
                                    </p>
                                ) : null}
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
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isScheduleModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={closeScheduleModal}
                >
                    <div
                        className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">
                                    Atur Jadwal Ujian
                                </h3>
                                <p className="text-sm text-slate-500">
                                    {schedulePacket ? resolvePacketDisplayTitle(schedulePacket) : 'Packet ujian'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeScheduleModal}
                                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
                                disabled={isScheduleSaving}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                            {isScheduleLoading ? (
                                <div className="py-12 text-center text-sm text-slate-500">Memuat data kelas...</div>
                            ) : scheduleRows.length === 0 ? (
                                <div className="py-12 text-center text-sm text-slate-500">
                                    Tidak ada kelas assignment untuk mapel pada packet ini.
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-xl border border-slate-200">
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead className="bg-slate-50 text-slate-600">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold w-14">Pilih</th>
                                                <th className="px-4 py-3 text-left font-semibold">Kelas</th>
                                                <th className="px-4 py-3 text-left font-semibold">Mulai</th>
                                                <th className="px-4 py-3 text-left font-semibold">Selesai</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {scheduleRows.map((row) => (
                                                <tr key={row.classId} className="border-t border-slate-100">
                                                    <td className="px-4 py-3">
                                                        <input
                                                            id={`schedule-select-${row.classId}`}
                                                            type="checkbox"
                                                            checked={row.selected}
                                                            onChange={(event) =>
                                                                handleScheduleRowChange(
                                                                    row.classId,
                                                                    'selected',
                                                                    event.target.checked,
                                                                )
                                                            }
                                                            className="h-4 w-4"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-800">{row.className}</td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            id={`schedule-start-${row.classId}`}
                                                            type="datetime-local"
                                                            value={row.startTime}
                                                            disabled={!row.selected}
                                                            onChange={(event) =>
                                                                handleScheduleRowChange(
                                                                    row.classId,
                                                                    'startTime',
                                                                    event.target.value,
                                                                )
                                                            }
                                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            id={`schedule-end-${row.classId}`}
                                                            type="datetime-local"
                                                            value={row.endTime}
                                                            disabled={!row.selected}
                                                            onChange={(event) =>
                                                                handleScheduleRowChange(
                                                                    row.classId,
                                                                    'endTime',
                                                                    event.target.value,
                                                                )
                                                            }
                                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={closeScheduleModal}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                                disabled={isScheduleSaving}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveScheduleModal}
                                disabled={isScheduleSaving || isScheduleLoading}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {isScheduleSaving ? 'Menyimpan...' : 'Simpan Jadwal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isCreateInfoModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setIsCreateInfoModalOpen(false)}
                >
                    <div
                        className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Informasi Ujian</h3>
                                <p className="text-sm text-slate-500">Isi data utama sebelum lanjut ke butir soal.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCreateInfoModalOpen(false)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
                            <div>
                                <label htmlFor="create-exam-title" className="mb-1 block text-sm font-medium text-slate-700">
                                    Judul Ujian
                                </label>
                                <input
                                    id="create-exam-title"
                                    type="text"
                                    value={createExamInfoDraft.title}
                                    onChange={(event) =>
                                        setCreateExamInfoDraft((prev) => ({ ...prev, title: event.target.value }))
                                    }
                                    placeholder="Masukkan judul ujian"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                    <label htmlFor="create-exam-assignment" className="mb-1 block text-sm font-medium text-slate-700">
                                        Mapel & Kelas (Assignment)
                                    </label>
                                    <select
                                        id="create-exam-assignment"
                                        value={createExamInfoDraft.assignmentId}
                                        onChange={(event) => {
                                            const selectedAssignment = filteredAssignmentsByProgram.find(
                                                (assignment) =>
                                                    String(assignment.id) === String(event.target.value),
                                            );
                                            setCreateExamInfoDraft((prev) => ({
                                                ...prev,
                                                assignmentId: event.target.value,
                                                subjectId: String(selectedAssignment?.subject?.id || ''),
                                            }));
                                        }}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    >
                                        <option value="">Pilih assignment mapel-kelas</option>
                                        {filteredAssignmentsByProgram.map((assignment) => (
                                            <option key={assignment.id} value={assignment.id}>
                                                {buildAssignmentDisplayLabel(assignment)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                            <div>
                                <label htmlFor="create-exam-semester" className="mb-1 block text-sm font-medium text-slate-700">
                                    Semester
                                </label>
                                <select
                                    id="create-exam-semester"
                                    value={createExamInfoDraft.semester}
                                    disabled={Boolean(selectedProgram?.fixedSemester)}
                                    onChange={(event) =>
                                        setCreateExamInfoDraft((prev) => ({
                                            ...prev,
                                            semester: event.target.value as 'ODD' | 'EVEN',
                                        }))
                                    }
                                    className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${
                                        selectedProgram?.fixedSemester ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''
                                    }`}
                                >
                                    <option value="ODD">Ganjil</option>
                                    <option value="EVEN">Genap</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="create-exam-type" className="mb-1 block text-sm font-medium text-slate-700">
                                    Tipe Ujian
                                </label>
                                <input
                                    id="create-exam-type"
                                    readOnly
                                    value={selectedProgram?.label || selectedProgram?.code || '-'}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                                />
                            </div>

                            <div>
                                <label htmlFor="create-exam-duration" className="mb-1 block text-sm font-medium text-slate-700">
                                    Durasi (menit)
                                </label>
                                <input
                                    id="create-exam-duration"
                                    type="number"
                                    value={createExamInfoDraft.duration}
                                    onChange={(event) =>
                                        setCreateExamInfoDraft((prev) => ({ ...prev, duration: event.target.value }))
                                    }
                                    placeholder="Contoh: 90"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label htmlFor="create-exam-instructions" className="mb-1 block text-sm font-medium text-slate-700">
                                    Instruksi Ujian
                                </label>
                                <input
                                    id="create-exam-instructions"
                                    type="text"
                                    value={createExamInfoDraft.instructions}
                                    onChange={(event) =>
                                        setCreateExamInfoDraft((prev) => ({ ...prev, instructions: event.target.value }))
                                    }
                                    placeholder="Instruksi / catatan untuk siswa"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setIsCreateInfoModalOpen(false)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateExamFromModal}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                Simpan Informasi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
