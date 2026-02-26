import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import type { User } from '../../../types/auth';
import { 
    Save, 
    ArrowLeft, 
    Plus, 
    Check,
    Clock,
    Award,
    BookOpen,
    AlertCircle,
    LayoutGrid,
    Image as ImageIcon,
    X,
    FileVideo,
    BookCopy,
    Trash2
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { examService, normalizeExamProgramCode } from '../../../services/exam.service';
import type { ExamProgram, ExamType, Question, QuestionBlueprint, QuestionCard } from '../../../services/exam.service';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';
import api from '../../../services/api';
import { QuestionBankModal } from '../../../components/teacher/exams/QuestionBankModal';

// Extended Question interface for UI state and Backend Payload compatibility
interface ExtendedQuestion extends Question {
    saveToBank?: boolean;
    question_image_url?: string;
    question_video_url?: string;
    question_video_type?: 'upload' | 'youtube';
    question_media_position?: 'top' | 'bottom' | 'left' | 'right';
    options?: {
        id: string;
        content: string;
        isCorrect: boolean;
        image_url?: string;
    }[];
}

function createDefaultBlueprint(): QuestionBlueprint {
    return {
        competency: '',
        learningObjective: '',
        indicator: '',
        materialScope: '',
        cognitiveLevel: '',
    };
}

function createDefaultQuestionCard(): QuestionCard {
    return {
        stimulus: '',
        answerRationale: '',
        scoringGuideline: '',
        distractorNotes: '',
    };
}

function normalizeBlueprint(raw: unknown): QuestionBlueprint {
    const source = raw && typeof raw === 'object' ? (raw as QuestionBlueprint) : {};
    return {
        ...createDefaultBlueprint(),
        competency: source.competency || '',
        learningObjective: source.learningObjective || '',
        indicator: source.indicator || '',
        materialScope: source.materialScope || '',
        cognitiveLevel: source.cognitiveLevel || '',
    };
}

function normalizeQuestionCard(raw: unknown): QuestionCard {
    const source = raw && typeof raw === 'object' ? (raw as QuestionCard) : {};
    return {
        ...createDefaultQuestionCard(),
        stimulus: source.stimulus || '',
        answerRationale: source.answerRationale || '',
        scoringGuideline: source.scoringGuideline || '',
        distractorNotes: source.distractorNotes || '',
    };
}

// Quill modules configuration
const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'script': 'sub'}, { 'script': 'super' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }, { 'direction': 'rtl' }],
    [{ 'color': [] }, { 'background': [] }],
    ['link'],
    ['clean']
  ],
};

interface PacketForm {
  title: string;
  description: string;
  type: ExamType;
  programCode: string;
  duration: number;
  kkm: number;
  subjectId: number;
  academicYearId: number;
  semester: string;
  saveToBank: boolean;
  instructions: string;
  questions: ExtendedQuestion[];
}

function inferFixedSemesterFromBaseType(type?: string | null): 'ODD' | 'EVEN' | null {
  const normalized = String(type || '').toUpperCase();
  if (normalized === 'SAS') return 'ODD';
  if (normalized === 'SAT') return 'EVEN';
  return null;
}

function assertTypeSemesterMatch(type: ExamType, semester: string) {
  if (type === 'SAS' && semester !== 'ODD') {
    throw new Error('SAS hanya boleh untuk semester Ganjil.');
  }
  if (type === 'SAT' && semester !== 'EVEN') {
    throw new Error('SAT hanya boleh untuk semester Genap.');
  }
}

function getScoreSyncCopy(program?: ExamProgram | null): string {
  if (!program) {
    return 'Nilai ujian otomatis tersinkron ke komponen nilai sesuai konfigurasi Program Ujian.';
  }

  const componentLabel = String(
    program.gradeComponentLabel || program.shortLabel || program.label || program.gradeComponentCode || program.code,
  )
    .trim()
    .toUpperCase();
  const entryModeCode = normalizeExamProgramCode(program.gradeEntryModeCode || program.gradeEntryMode);
  const fixedSemester = program.fixedSemester;

  if (entryModeCode === 'NF_SERIES') {
    return `Nilai disimpan sebagai entri formatif dinamis pada komponen ${componentLabel}.`;
  }

  if (fixedSemester === 'ODD') {
    return `Nilai ujian otomatis tersinkron ke komponen ${componentLabel}. Program ini khusus semester Ganjil.`;
  }

  if (fixedSemester === 'EVEN') {
    return `Nilai ujian otomatis tersinkron ke komponen ${componentLabel}. Program ini khusus semester Genap.`;
  }

  return `Nilai ujian otomatis tersinkron ke komponen ${componentLabel}.`;
}

export const ExamEditorPage = () => {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const isEditMode = !!id;

    // Ref to track submission status to prevent draft saving during submit
    const isSubmittingRef = React.useRef(false);
    // Ref to track if draft has been loaded to prevent double question initialization
    const draftLoadedRef = React.useRef(false);
    // Ref for autosave debounce
    const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const [loading, setLoading] = useState(false);
    const [subjects, setSubjects] = useState<{id: number, name: string, kkm?: number}[]>([]);
    const [activeAcademicYear, setActiveAcademicYear] = useState<{id: number, name: string} | null>(null);
    
    // 1. Get Current User via Query (Database Persistence)
    const { user: contextUser } = useOutletContext<{ user: User }>() || {};
    const { data: authData } = useQuery({
        queryKey: ['me'],
        queryFn: authService.getMe,
        enabled: !contextUser,
        staleTime: 1000 * 60 * 5,
    });
    const user = contextUser || (authData?.data as User | undefined);
    const userId = user?.id;

    // Fetch User Profile for Preferences
    const { data: userData } = useQuery({
      queryKey: ['user-profile', userId],
      queryFn: () => {
        if (!userId) return null;
        return userService.getById(userId);
      },
      enabled: !!userId,
    });

    const updateProfileMutation = useMutation({
      mutationFn: (data: any) => {
        if (!userId) throw new Error('User ID not found');
        return userService.update(userId, data);
      },
      onSuccess: () => {
         // Silently update, maybe invalidate if needed but avoid loop
         // queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
      }
    });
    
    // Questions State
    const [questions, setQuestions] = useState<ExtendedQuestion[]>([]);
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);

    // UI State for Editor
    const [section, setSection] = useState<'OBJECTIVE' | 'ESSAY'>('OBJECTIVE');
    const [editorStage, setEditorStage] = useState<'INFO' | 'QUESTIONS'>('INFO');
    
    // Media Upload State
    // Removed mediaTarget state as we use direct targetId passing

    const routeState = (location.state as {
        type?: ExamType;
        programCode?: string;
        programLabel?: string;
        fixedSemester?: 'ODD' | 'EVEN' | null;
    } | null) || null;
    const presetType = routeState?.type;
    const presetProgramCode = normalizeExamProgramCode(routeState?.programCode || routeState?.type || 'FORMATIF');
    const presetProgramLabel = routeState?.programLabel || '';
    const presetFixedSemester = routeState?.fixedSemester || inferFixedSemesterFromBaseType(routeState?.type);

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<PacketForm>({
        defaultValues: {
            type: presetType || 'FORMATIF',
            programCode: presetProgramCode,
            duration: undefined,
            kkm: 75,
            saveToBank: true,
            semester: presetFixedSemester || 'ODD',
            questions: []
        }
    });

    // Auto-Draft Logic using User Preferences (Database)
    const formValues = watch();
    const watchedPacketType = (watch('type') || presetType || 'FORMATIF') as ExamType;
    const selectedPacketSemester = watch('semester') || 'ODD';
    const selectedProgramCodeRaw = watch('programCode') || presetProgramCode;
    const selectedProgramCode = normalizeExamProgramCode(selectedProgramCodeRaw);
    const selectedAcademicYearId = Number(watch('academicYearId') || activeAcademicYear?.id || 0);

    const { data: examProgramsRes } = useQuery({
        queryKey: ['teacher-exam-programs-editor', selectedAcademicYearId],
        enabled: selectedAcademicYearId > 0,
        staleTime: 5 * 60 * 1000,
        queryFn: () =>
            examService.getPrograms({
                academicYearId: selectedAcademicYearId,
                roleContext: 'teacher',
            }),
    });

    const teacherPrograms = useMemo<ExamProgram[]>(
        () => (examProgramsRes?.data?.programs || []).filter((program: ExamProgram) => Boolean(program?.isActive)),
        [examProgramsRes?.data?.programs],
    );

    const selectedProgramMeta = useMemo<ExamProgram | null>(() => {
        if (!selectedProgramCode) return null;
        return (
            teacherPrograms.find(
                (program) => normalizeExamProgramCode(program.code) === selectedProgramCode,
            ) || null
        );
    }, [selectedProgramCode, teacherPrograms]);

    const resolvedPacketType = (selectedProgramMeta?.baseType || watchedPacketType || presetType || 'FORMATIF') as ExamType;
    const resolvedFixedSemester =
        selectedProgramMeta?.fixedSemester || presetFixedSemester || inferFixedSemesterFromBaseType(resolvedPacketType);
    const isTypeLockedFromRoute = !isEditMode && Boolean(routeState?.programCode || routeState?.type);
    const isSemesterLockedFromProgram = !isEditMode && Boolean(resolvedFixedSemester);
    const scoreSyncCopy = getScoreSyncCopy(selectedProgramMeta);
    const examTypeDisplayLabel =
        selectedProgramMeta?.label ||
        presetProgramLabel ||
        selectedProgramMeta?.shortLabel ||
        selectedProgramCode ||
        resolvedPacketType;
    
    // Restore draft on mount (only for create mode)
    useEffect(() => {
        if (!isEditMode && userData?.data?.preferences?.exam_draft && !draftLoadedRef.current) {
            const draft = userData.data.preferences.exam_draft;
            // No need to parse JSON as it's already an object in preferences
            
            if (draft) {
                // Confirm restoration
                if (window.confirm('Ditemukan draft ujian yang belum tersimpan. Apakah Anda ingin melanjutkannya?')) {
                    try {
                        const parsed = draft; // Already object
                        if (parsed.form) {
                            // Restore basic fields
                            setValue('title', parsed.form.title);
                            setValue('description', parsed.form.description);
                            setValue('duration', parsed.form.duration);
                            setValue('instructions', parsed.form.instructions);
                            setValue('subjectId', parsed.form.subjectId);
                            // Skip restoring academicYearId to ensure we use the active one
                            // setValue('academicYearId', parsed.form.academicYearId);
                            
                            // Program dari route lebih prioritas daripada draft.
                            if (presetFixedSemester === 'ODD' || presetFixedSemester === 'EVEN') {
                                setValue('semester', presetFixedSemester);
                            }

                            setValue('saveToBank', parsed.form.saveToBank);
                            setValue(
                                'programCode',
                                normalizeExamProgramCode(presetProgramCode || parsed.form.programCode || parsed.form.type || 'FORMATIF'),
                            );
                            // Do NOT restore type, let context route handle it
                        }
                        if (parsed.questions && parsed.questions.length > 0) {
                            setQuestions(parsed.questions);
                            setActiveQuestionId(parsed.questions[0].id);
                            draftLoadedRef.current = true;
                            toast.success('Draft ujian sebelumnya berhasil dipulihkan', { icon: '📝' });
                        }
                    } catch (e) {
                        console.error('Failed to parse draft', e);
                    }
                } else {
                    // Clear draft if user declines
                    if (userId) {
                        const currentPrefs = userData?.data?.preferences || {};
                        updateProfileMutation.mutate({
                            preferences: { ...currentPrefs, exam_draft: null }
                        });
                    }
                }
            }
        }
    }, [isEditMode, userData, presetFixedSemester, presetProgramCode, setValue, userId]);

    useEffect(() => {
        if (!isEditMode) {
            if (presetType) setValue('type', presetType);
            if (presetProgramCode) {
                setValue('programCode', normalizeExamProgramCode(presetProgramCode));
            }
            if (presetFixedSemester === 'ODD' || presetFixedSemester === 'EVEN') {
                setValue('semester', presetFixedSemester);
            }
        }
    }, [isEditMode, presetType, presetProgramCode, presetFixedSemester, setValue]);

    useEffect(() => {
        if (normalizeExamProgramCode(selectedProgramCodeRaw) !== selectedProgramCode) {
            setValue('programCode', selectedProgramCode);
        }

        const syncedType = (selectedProgramMeta?.baseType || watchedPacketType || 'FORMATIF') as ExamType;
        if (syncedType !== watchedPacketType) {
            setValue('type', syncedType);
        }

        if (
            (resolvedFixedSemester === 'ODD' || resolvedFixedSemester === 'EVEN') &&
            selectedPacketSemester !== resolvedFixedSemester
        ) {
            setValue('semester', resolvedFixedSemester);
            return;
        }

        if (syncedType === 'SAS' && selectedPacketSemester !== 'ODD') {
            setValue('semester', 'ODD');
        } else if (syncedType === 'SAT' && selectedPacketSemester !== 'EVEN') {
            setValue('semester', 'EVEN');
        }
    }, [
        selectedProgramCodeRaw,
        selectedProgramCode,
        selectedProgramMeta?.baseType,
        watchedPacketType,
        selectedPacketSemester,
        resolvedFixedSemester,
        setValue,
    ]);

    // Save draft on change (Debounced to Database)
    useEffect(() => {
        if (!isEditMode && !isSubmittingRef.current && userId) {
            const hasContent = questions.length > 0 && (questions[0].content || questions.length > 1);
            const hasTitle = formValues.title && formValues.title.trim() !== '';
            
            if (hasContent || hasTitle) {
                // Clear previous timeout
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                }

                // Set new timeout for 2 seconds debounce
                saveTimeoutRef.current = setTimeout(() => {
                    const draft = {
                        form: formValues,
                        questions: questions
                    };
                    
                    const currentPrefs = userData?.data?.preferences || {};
                    // Check if draft actually changed to avoid loop (deep check might be expensive, relying on effect deps)
                    updateProfileMutation.mutate({
                        preferences: { ...currentPrefs, exam_draft: draft }
                    });
                }, 2000);
            }
        }

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [questions, formValues, isEditMode, userId, userData]); // Added userData to deps for currentPrefs, but careful about loops. 
    // Actually, depending on userData might cause loops if updateProfileMutation updates userData immediately.
    // Better to use a ref for currentPrefs or functional update if possible, but updateProfileMutation doesn't support functional update of remote state directly without context.
    // However, userData comes from useQuery. When mutation succeeds, we might invalidate.
    // If we invalidate, userData updates -> effect runs -> saves again -> infinite loop?
    // We should probably NOT depend on userData in the effect, or only read it inside the timeout callback without it being a dep, 
    // BUT React warns about missing deps.
    // Safe approach: Use functional state update pattern IF the API supported it, but it doesn't.
    // Alternative: Only save if significant change? 
    // Or: In the mutation success, DO NOT invalidate 'user-profile' immediately if we are just saving a draft?
    // In my previous tool call for restoration, I added `queryClient.invalidateQueries` in onSuccess.
    // For autosave, maybe we should NOT invalidate, just let it save silently.
    // The restoration logic uses `userData` to load.
    
    // Let's look at the mutation definition I added earlier:
    /*
    const updateProfileMutation = useMutation({
      mutationFn: (data: any) => userService.update(userId, data),
      onSuccess: () => {
         // Silently update, maybe invalidate if needed but avoid loop
         // queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
      }
    });
    */
    // I commented out invalidateQueries in the previous step's SearchReplace for this exact reason (to avoid loops or too many refetches).
    // So depending on userData is "safe-ish" but still risky if userData reference changes.
    // Better: Get current prefs inside the timeout callback via a ref or by ensuring userData is stable? 
    // Actually, I can just merge with `userData` inside the timeout. If `userData` changes, the effect runs again, resetting the timer. 
    // If the user types continuously, it resets. If they stop, it saves.
    // If it saves -> mutation success -> NO invalidation -> userData does NOT change -> Effect does NOT run again. Loop avoided.
    // Correct.


    const selectedSubjectId = watch('subjectId');

    // Effect to update KKM when subject changes
    useEffect(() => {
        if (selectedSubjectId && subjects.length > 0) {
            const subject = subjects.find(s => s.id == selectedSubjectId);
            if (subject && subject.kkm) {
                setValue('kkm', subject.kkm);
            }
        }
    }, [selectedSubjectId, subjects, setValue]);

    useEffect(() => {
        const init = async () => {
            await fetchInitialData();
            if (isEditMode && id) {
                await fetchPacketData(parseInt(id));
            } else if (!isEditMode && !draftLoadedRef.current) {
                addQuestion();
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Update section state when active question changes
    useEffect(() => {
        if (activeQuestionId) {
            const q = questions.find(q => q.id === activeQuestionId);
            if (q) {
                if (q.type === 'ESSAY') {
                    setSection('ESSAY');
                } else {
                    setSection('OBJECTIVE');
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuestionId]);

    const fetchInitialData = async () => {
        try {
            const [ayRes, assignRes] = await Promise.all([
                academicYearService.getActive(),
                teacherAssignmentService.list({ limit: 100 })
            ]);
            
            if (ayRes.data) {
                setActiveAcademicYear(ayRes.data);
                // Set default academic year if creating new
                if (!isEditMode) {
                    setValue('academicYearId', ayRes.data.id);
                    setValue('programCode', normalizeExamProgramCode(presetProgramCode || presetType || 'FORMATIF'));
                    // Also set semester from active AY if not locked by program
                    if (presetFixedSemester === 'ODD' || presetFixedSemester === 'EVEN') {
                        setValue('semester', presetFixedSemester);
                    } else {
                        setValue('semester', ayRes.data.semester || 'ODD');
                    }
                }
            }
            
            const assignments = assignRes.data?.assignments || [];
            const uniqueSubjectsMap = new Map();
            assignments.forEach((a: TeacherAssignment) => {
                if (!uniqueSubjectsMap.has(a.subject.id)) {
                    uniqueSubjectsMap.set(a.subject.id, { ...a.subject, kkm: a.kkm || 75 });
                }
            });
            setSubjects(Array.from(uniqueSubjectsMap.values()) as {id: number, name: string, kkm?: number}[]);

        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    };

    const fetchPacketData = async (packetId: number) => {
        try {
            setLoading(true);
            const res = await examService.getPacketById(packetId);
            const packet = res.data;
            
            setValue('title', packet.title);
            setValue('description', packet.description || '');
            setValue('type', packet.type);
            setValue('programCode', normalizeExamProgramCode(packet.programCode || packet.type));
            setValue('duration', packet.duration);
            setValue('kkm', packet.kkm);
            setValue('subjectId', Number(packet.subjectId));
            setValue('academicYearId', packet.academicYearId);
            setValue('semester', packet.semester || 'ODD');
            setValue('instructions', packet.instructions || '');
            
            if (packet.questions) {
                const mappedQuestions: ExtendedQuestion[] = packet.questions.map((q: any) => {
                    const blueprintSource = q?.blueprint ?? q?.metadata?.blueprint;
                    const questionCardSource = q?.questionCard ?? q?.metadata?.questionCard;
                    return {
                        ...q,
                        saveToBank: true,
                        question_image_url: q.question_image_url,
                        question_video_url: q.question_video_url,
                        question_video_type: q.question_video_type,
                        blueprint: normalizeBlueprint(blueprintSource),
                        questionCard: normalizeQuestionCard(questionCardSource),
                    };
                });
                setQuestions(mappedQuestions);
                if (mappedQuestions.length > 0) {
                    setActiveQuestionId(mappedQuestions[0].id);
                }
            }
        } catch (error) {
            console.error('Error fetching packet:', error);
            toast.error('Gagal memuat data ujian');
        } finally {
            setLoading(false);
        }
    };

    const addQuestion = () => {
        const type = section === 'ESSAY' ? 'ESSAY' : 'MULTIPLE_CHOICE';
        const newQuestion: ExtendedQuestion = {
            id: Math.random().toString(36).substr(2, 9),
            content: '',
            type: type,
            score: 1, // Default bobot 1
            saveToBank: true,
            blueprint: createDefaultBlueprint(),
            questionCard: createDefaultQuestionCard(),
            options: type !== 'ESSAY' ? [
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
            ] : []
        };
        
        setQuestions(prev => [...prev, newQuestion]);
        setActiveQuestionId(newQuestion.id);
    };

    const removeQuestion = (qId: string) => {
        if (questions.length <= 1) {
            toast.error('Minimal harus ada 1 soal');
            return;
        }
        
        const newQuestions = questions.filter(q => q.id !== qId);
        setQuestions(newQuestions);
        
        if (activeQuestionId === qId) {
            setActiveQuestionId(newQuestions[newQuestions.length - 1].id);
        }
    };

    const handleDeleteQuestion = (qId: string) => {
        if (questions.length <= 1) {
            toast.error('Minimal harus ada 1 soal');
            return;
        }

        if (window.confirm('Apakah Anda yakin ingin menghapus soal ini?')) {
            removeQuestion(qId);
            toast.success('Soal berhasil dihapus');
        }
    };

    const updateQuestion = (qId: string | null, updates: Partial<ExtendedQuestion>) => {
        if (!qId) return;
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, ...updates } : q));
    };

    const updateQuestionBlueprintField = (qId: string, field: keyof QuestionBlueprint, value: string) => {
        const question = questions.find((item) => item.id === qId);
        const currentBlueprint = normalizeBlueprint(question?.blueprint);
        updateQuestion(qId, {
            blueprint: {
                ...currentBlueprint,
                [field]: value,
            },
        });
    };

    const updateQuestionCardField = (qId: string, field: keyof QuestionCard, value: string) => {
        const question = questions.find((item) => item.id === qId);
        const currentQuestionCard = normalizeQuestionCard(question?.questionCard);
        updateQuestion(qId, {
            questionCard: {
                ...currentQuestionCard,
                [field]: value,
            },
        });
    };

    const handleImportQuestions = (importedQuestions: Question[]) => {
        const newQuestions = importedQuestions.map(q => ({
            ...q,
            id: Math.random().toString(36).substr(2, 9), // Generate new ID to avoid conflict
            saveToBank: false, // Don't save back to bank by default since it came from there
            blueprint: normalizeBlueprint(q.blueprint ?? q.metadata?.blueprint),
            questionCard: normalizeQuestionCard(q.questionCard ?? q.metadata?.questionCard),
            options: q.options?.map(o => ({
                ...o,
                id: Math.random().toString(36).substr(2, 9)
            }))
        }));

        setQuestions(prev => {
            // Remove initial empty question if it's the only one and empty
            if (prev.length === 1 && !prev[0].content && prev[0].options?.every(o => !o.content)) {
                return newQuestions;
            }
            return [...prev, ...newQuestions];
        });

        if (newQuestions.length > 0) {
            setActiveQuestionId(newQuestions[0].id);
        }
        toast.success(`${newQuestions.length} soal berhasil diimport`);
    };

    const handleSectionChange = (newSection: 'OBJECTIVE' | 'ESSAY') => {
        setSection(newSection);
        if (activeQuestionId) {
            const newType = newSection === 'ESSAY' ? 'ESSAY' : 'MULTIPLE_CHOICE';
            
            let newOptions: { id: string; content: string; isCorrect: boolean }[] = [];
            if (newType !== 'ESSAY') {
                newOptions = [
                    { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                    { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                    { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                    { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                    { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                ];
            }

            updateQuestion(activeQuestionId, { 
                type: newType,
                options: newOptions
            });
        }
    };

    const handleTypeChange = (newType: Question['type']) => {
        if (!activeQuestionId) return;
        
        const currentQ = questions.find(q => q.id === activeQuestionId);
        let newOptions = currentQ?.options || [];

        if (newType === 'TRUE_FALSE') {
             newOptions = [
                { id: Math.random().toString(36).substr(2, 9), content: 'Benar', isCorrect: true },
                { id: Math.random().toString(36).substr(2, 9), content: 'Salah', isCorrect: false },
            ];
        } else if ((newType === 'MULTIPLE_CHOICE' || newType === 'COMPLEX_MULTIPLE_CHOICE') && newOptions.length < 2) {
             newOptions = [
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
            ];
        }

        updateQuestion(activeQuestionId, { 
            type: newType,
            options: newOptions
        });
    };

    // --- Media Handling Logic ---

    const handleImageUpload = async (file: File, targetId?: string) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Ukuran gambar maksimal 2MB');
            return;
        }

        const currentTarget = targetId || 'question';
        const toastId = toast.loading('Mengupload gambar...');
        try {
            const formDataUpload = new FormData();
            formDataUpload.append('image', file);

            const response = await api.post('/upload/question-image', formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.success) {
                const imageUrl = response.data.data.url;
                if (currentTarget === 'question' && activeQuestionId) {
                    updateQuestion(activeQuestionId, { question_image_url: imageUrl });
                } else if (activeQuestionId) {
                    const currentQ = questions.find(q => q.id === activeQuestionId);
                    if (currentQ && currentQ.options) {
                        const newOptions = currentQ.options.map(opt => 
                            opt.id === currentTarget ? { ...opt, image_url: imageUrl } : opt
                        );
                        updateQuestion(activeQuestionId, { options: newOptions });
                    }
                }
                toast.success('Gambar berhasil diupload', { id: toastId });
            }
        } catch (error: unknown) {
            console.error('Upload error:', error);
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Gagal upload gambar', { id: toastId });
        }
    };

    const handleVideoUpload = async (file: File) => {
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Ukuran video maksimal 10MB');
            return;
        }

        const toastId = toast.loading('Mengupload video...');
        try {
            const formDataUpload = new FormData();
            formDataUpload.append('video', file);

            const response = await api.post('/upload/question-video', formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.success) {
                if (activeQuestionId) {
                    updateQuestion(activeQuestionId, { 
                        question_video_url: response.data.data.url,
                        question_video_type: 'upload'
                    });
                }
                toast.success('Video berhasil diupload', { id: toastId });
            }
        } catch (error: unknown) {
            console.error('Upload error:', error);
            const err = error as any;
            let msg = err.response?.data?.message || 'Gagal upload video';
            if (err.response?.status === 413) {
                msg = 'Ukuran file terlalu besar (Maksimal 10MB)';
            }
            toast.error(msg, { id: toastId });
        }
    };

    const handleYouTubeUrl = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);

        if (match && match[2].length === 11) {
            const videoId = match[2];
            const embedUrl = `https://www.youtube.com/embed/${videoId}`;
            if (activeQuestionId) {
                updateQuestion(activeQuestionId, { 
                    question_video_url: embedUrl,
                    question_video_type: 'youtube'
                });
                toast.success('Video YouTube ditambahkan');
            }
        } else {
            toast.error('URL YouTube tidak valid');
        }
    };

    const handleRemoveMedia = (type: 'image' | 'video', targetId?: string) => {
        if (type === 'image') {
            if (!targetId || targetId === 'question') {
                updateQuestion(activeQuestionId, { question_image_url: undefined });
            } else {
                const currentQ = questions.find(q => q.id === activeQuestionId);
                if (currentQ && currentQ.options) {
                    const newOptions = currentQ.options.map(opt => 
                        opt.id === targetId ? { ...opt, image_url: undefined } : opt
                    );
                    updateQuestion(activeQuestionId, { options: newOptions });
                }
            }
        } else {
            updateQuestion(activeQuestionId, { 
                question_video_url: undefined, 
                question_video_type: undefined 
            });
        }
    };

    const onSubmit = async (data: PacketForm) => {
        if (!activeAcademicYear) {
            toast.error('Tahun ajaran aktif tidak ditemukan');
            return;
        }
        const normalizedProgramCode = normalizeExamProgramCode(data.programCode || selectedProgramCode || data.type || 'FORMATIF');
        const effectiveProgram =
            selectedProgramMeta ||
            teacherPrograms.find(
                (program) => normalizeExamProgramCode(program.code) === normalizedProgramCode,
            ) ||
            null;
        const effectiveType = (effectiveProgram?.baseType || data.type || resolvedPacketType || 'FORMATIF') as ExamType;
        const effectiveFixedSemester =
            effectiveProgram?.fixedSemester ||
            inferFixedSemesterFromBaseType(effectiveType);
        try {
            assertTypeSemesterMatch(effectiveType, data.semester);
            if (
                (effectiveFixedSemester === 'ODD' || effectiveFixedSemester === 'EVEN') &&
                data.semester !== effectiveFixedSemester
            ) {
                throw new Error(
                    `Program ini hanya boleh semester ${effectiveFixedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.`,
                );
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Kombinasi tipe ujian dan semester tidak valid.';
            toast.error(message);
            return;
        }

        if (!data.duration || Number(data.duration) <= 0) {
            toast.error('Isi durasi waktu ujian');
            return;
        }
        
        if (questions.length === 0) {
            toast.error('Minimal harus ada 1 soal');
            return;
        }

        // Validate Total Score & Auto-scale
        const currentTotalScore = questions.reduce((acc, q) => acc + (q.score || 0), 0);
        let finalQuestions = questions;

        if (currentTotalScore > 0 && currentTotalScore !== 100) {
            // Auto-scale to 100
            finalQuestions = questions.map(q => ({
                ...q,
                score: parseFloat(((q.score / currentTotalScore) * 100).toFixed(2))
            }));
            toast.success(`Bobot otomatis dikonversi ke skala 100 (Total awal: ${currentTotalScore})`, { icon: '⚖️' });
        }

        // Validate Questions
        for (let i = 0; i < finalQuestions.length; i++) {
            const q = finalQuestions[i];
            const hasMedia = q.question_image_url || q.question_video_url;
            const hasContent = q.content && q.content.trim() !== '' && q.content !== '<p><br></p>';

            if (!hasContent && !hasMedia) {
                 toast.error(`Soal nomor ${i + 1} belum memiliki pertanyaan (Teks atau Media)`);
                 return;
            }

            const blueprint = normalizeBlueprint(q.blueprint);
            if (!blueprint.learningObjective || !blueprint.indicator) {
                toast.error(`Soal nomor ${i + 1} wajib mengisi kisi-kisi: tujuan pembelajaran dan indikator soal.`);
                return;
            }

            const questionCard = normalizeQuestionCard(q.questionCard);
            if (!questionCard.answerRationale) {
                toast.error(`Soal nomor ${i + 1} wajib mengisi kartu soal: pembahasan/jawaban.`);
                return;
            }

            if (q.type !== 'ESSAY') {
                // Validate Options (Must not be empty unless image is present)
                if (q.options) {
                    for (let j = 0; j < q.options.length; j++) {
                        const opt = q.options[j];
                        const hasOptContent = opt.content && opt.content.trim() !== '';
                        const hasOptImage = opt.image_url;
                        if (!hasOptContent && !hasOptImage) {
                             toast.error(`Pilihan jawaban ke-${j + 1} pada soal nomor ${i + 1} tidak boleh kosong (isi teks atau gambar)`);
                             return;
                        }
                    }
                }

                const correctCount = q.options?.filter(o => o.isCorrect).length || 0;
                if (q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') {
                    if (correctCount !== 1) {
                        toast.error(`Soal nomor ${i + 1} harus memiliki 1 jawaban benar`);
                        return;
                    }
                } else if (q.type === 'COMPLEX_MULTIPLE_CHOICE') {
                    if (correctCount < 1) {
                        toast.error(`Soal nomor ${i + 1} harus memiliki minimal 1 jawaban benar`);
                        return;
                    }
                }
            }
        }

        const payload = {
            ...data,
            type: effectiveType,
            programCode: normalizedProgramCode,
            duration: Number(data.duration),
            academicYearId: Number(data.academicYearId),
            semester:
                effectiveFixedSemester === 'ODD' || effectiveFixedSemester === 'EVEN'
                    ? effectiveFixedSemester
                    : data.semester,
            questions: finalQuestions
        };

        try {
            setLoading(true);
            isSubmittingRef.current = true; // Block draft saving
            
            if (isEditMode) {
                await examService.updatePacket(parseInt(id!), payload);
                toast.success('Paket ujian berhasil diperbarui');
            } else {
                await examService.createPacket(payload);
                toast.success('Paket ujian berhasil dibuat');
                // Clear draft only on successful create
                if (userId) {
                    const currentPrefs = userData?.data?.preferences || {};
                    updateProfileMutation.mutate({
                        preferences: { ...currentPrefs, exam_draft: null }
                    });
                }
                
                // Invalidate queries to update lists
                queryClient.invalidateQueries({ queryKey: ['exam-packets'] });
                queryClient.invalidateQueries({ queryKey: ['bank-questions'] });
            }
            navigate(-1);
        } catch (error: unknown) {
            console.error('Error saving packet:', error);
            isSubmittingRef.current = false; // Unblock on error
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Gagal menyimpan paket ujian');
        } finally {
            setLoading(false);
        }
    };

    const activeQuestion = questions.find(q => q.id === activeQuestionId);
    const activeQuestionBlueprint = activeQuestion
        ? normalizeBlueprint(activeQuestion.blueprint)
        : createDefaultBlueprint();
    const activeQuestionCard = activeQuestion
        ? normalizeQuestionCard(activeQuestion.questionCard)
        : createDefaultQuestionCard();



    const renderMediaPreview = (q: ExtendedQuestion) => {
        if (!q.question_image_url && !q.question_video_url) return null;

        return (
            <div className="mb-4 flex flex-col sm:flex-row items-start gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="relative group/media inline-block max-w-full">
                    {q.question_image_url && (
                        <img 
                            src={q.question_image_url} 
                            alt="Question Media" 
                            className="max-h-[300px] rounded-lg border border-gray-200 shadow-sm"
                        />
                    )}
                    
                    {q.question_video_url && (
                        <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm max-w-[500px]">
                            {q.question_video_type === 'youtube' ? (
                                <div className="aspect-video w-full min-w-[300px]">
                                    <iframe
                                        src={q.question_video_url}
                                        className="w-full h-full"
                                        allowFullScreen
                                        title="YouTube Video"
                                    />
                                </div>
                            ) : (
                                <video 
                                    src={q.question_video_url} 
                                    controls 
                                    className="w-full max-h-[300px]"
                                />
                            )}
                        </div>
                    )}

                    <button 
                        onClick={() => handleRemoveMedia(q.question_image_url ? 'image' : 'video')}
                        className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full p-1 shadow-md border border-gray-200 opacity-0 group-hover/media:opacity-100 transition-opacity z-10 hover:bg-red-50"
                        title="Hapus Media"
                        type="button"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Media Position Control - Only appears when media exists */}
                <div className="flex flex-col gap-1 min-w-[120px]">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posisi Media</label>
                    <div className="flex bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => updateQuestion(activeQuestionId, { question_media_position: 'top' })}
                            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                (!q.question_media_position || q.question_media_position === 'top')
                                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            Atas
                        </button>
                        <button
                            type="button"
                            onClick={() => updateQuestion(activeQuestionId, { question_media_position: 'bottom' })}
                            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                q.question_media_position === 'bottom'
                                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            Bawah
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Helper untuk handle YouTube input di media bar
    const handleYouTubeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleYouTubeUrl(e.currentTarget.value);
            e.currentTarget.value = ''; // clear input
        }
    };

    // Total Score Indicator
    const totalScore = questions.reduce((acc, q) => acc + (q.score || 0), 0);
    const isTotalScoreValid = totalScore === 100;
    const completedQuestionCount = questions.filter((q) => q.content && q.content !== '<p><br></p>').length;
    const selectedSubjectName = subjects.find((subject) => subject.id == selectedSubjectId)?.name || '-';

    return (
        <div className="flex flex-col font-sans space-y-6 pb-20 w-full">
            {/* TOP NAVBAR: Title & Save */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-0 z-30">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button 
                            onClick={() => navigate(-1)} 
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
                        
                        <div className="flex-1 min-w-0 flex items-center gap-4">
                            <label htmlFor="exam-title" className="text-sm font-normal text-gray-700 uppercase tracking-wider whitespace-nowrap">Judul Ujian</label>
                            <input 
                                id="exam-title"
                                {...register('title', { required: 'Judul wajib diisi' })}
                                className="w-full px-4 py-2 border-b border-gray-300 focus:border-blue-500 bg-transparent text-gray-600 italic placeholder-gray-400 focus:outline-none transition-colors"
                                placeholder="Masukkan Judul Ujian"
                            />
                            {errors.title && <span className="text-xs text-red-500 block">{errors.title.message}</span>}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {/* Total Score Indicator */}
                        <div className={`hidden md:flex flex-col items-end mr-2 px-3 py-1 bg-gray-50 rounded-lg border ${isTotalScoreValid ? 'border-gray-100' : 'border-red-200 bg-red-50'}`}>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Bobot</span>
                            <span className={`text-sm font-bold ${isTotalScoreValid ? 'text-blue-600' : 'text-red-600'}`}>
                                {totalScore}
                                {!isTotalScoreValid && <span className="text-xs ml-1 text-red-400">/ 100</span>}
                            </span>
                        </div>

                        <button 
                            onClick={handleSubmit(onSubmit)}
                            disabled={loading}
                            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                        >
                            {loading ? <span className="animate-spin text-white">⏳</span> : <Save className="w-4 h-4" />}
                            <span>{loading ? 'Menyimpan...' : 'Simpan'}</span>
                        </button>
                    </div>
                </div>

                {/* STAGE BAR */}
                <div className="px-6 py-3 bg-white border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setEditorStage('INFO')}
                            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                                editorStage === 'INFO'
                                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:text-blue-700'
                            }`}
                        >
                            1. Informasi Ujian
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditorStage('QUESTIONS')}
                            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                                editorStage === 'QUESTIONS'
                                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:text-blue-700'
                            }`}
                        >
                            2. Butir Soal ({completedQuestionCount}/{questions.length})
                        </button>
                    </div>
                </div>

                {editorStage === 'INFO' ? (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 space-y-4">
                    <div className="flex flex-wrap gap-4 items-start">
                        {/* Subject */}
                        <div className="flex-1 min-w-[200px]">
                            <label htmlFor="exam-subject" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <BookOpen className="w-4 h-4 text-blue-600" />
                                MATA PELAJARAN
                            </label>
                            <div className="relative">
                                <select 
                                    id="exam-subject"
                                    {...register('subjectId', { required: 'Mapel wajib dipilih' })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white shadow-sm appearance-none font-medium text-gray-700 text-sm"
                                >
                                    <option value="">Pilih Mapel</option>
                                    {subjects.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>

                        {/* Academic Year */}
                        <div className="w-40">
                            <label htmlFor="exam-academic-year" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock className="w-4 h-4 text-purple-600" />
                                TAHUN AJARAN
                            </label>
                            <div className="relative">
                                <input 
                                    id="exam-academic-year"
                                    name="academicYearDisplay"
                                    value={activeAcademicYear?.name || '-'}
                                    readOnly
                                    className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg shadow-sm font-medium text-gray-600 text-sm cursor-not-allowed"
                                />
                                <input 
                                    type="hidden"
                                    {...register('academicYearId', { required: 'Tahun Ajaran wajib terisi' })}
                                />
                            </div>
                        </div>

                        {/* Semester */}
                        <div className="w-32">
                            <label htmlFor="exam-semester" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock className="w-4 h-4 text-purple-600" />
                                SEMESTER
                            </label>
                            <div className="relative">
                                <select 
                                    id="exam-semester"
                                    {...register('semester')}
                                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white shadow-sm appearance-none font-medium text-gray-700 text-sm ${isSemesterLockedFromProgram ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                    disabled={isSemesterLockedFromProgram}
                                >
                                    <option value="ODD">Ganjil</option>
                                    <option value="EVEN">Genap</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>

                        {/* Exam Type */}
                        <div className="w-36">
                            <label htmlFor="exam-type" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <BookOpen className="w-4 h-4 text-blue-600" />
                                TIPE UJIAN
                            </label>
                            <input
                                id="exam-type"
                                value={examTypeDisplayLabel}
                                readOnly
                                className={`w-full px-3 py-2 border rounded-lg shadow-sm font-medium text-sm ${
                                    isTypeLockedFromRoute
                                        ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                                        : 'border-gray-300 bg-white text-gray-700'
                                }`}
                            />
                            <input type="hidden" {...register('type')} />
                            <input type="hidden" {...register('programCode')} />
                        </div>

                        {/* Instructions */}
                        <div className="flex-[2] min-w-[250px]">
                            <label htmlFor="exam-instructions" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <AlertCircle className="w-4 h-4 text-purple-500" />
                                INSTRUKSI UJIAN
                            </label>
                            <input 
                                id="exam-instructions"
                                {...register('instructions')}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white shadow-sm font-medium text-sm"
                                placeholder="Instruksi / Catatan untuk siswa"
                            />
                        </div>

                        {/* Duration */}
                        <div className="w-24">
                            <label htmlFor="exam-duration" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock className="w-4 h-4 text-orange-500" />
                                Durasi
                            </label>
                            <input 
                                id="exam-duration"
                                type="number" 
                                {...register('duration')}
                                placeholder="Menit"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white shadow-sm font-medium text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-gray-400"
                            />
                        </div>

                        {/* KKM - Read Only, Hidden until Subject Selected */}
                        {selectedSubjectId && (
                            <div className="w-20">
                                <label htmlFor="exam-kkm" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                    <Award className="w-4 h-4 text-green-500" />
                                    KKM
                                </label>
                                <input 
                                    id="exam-kkm"
                                    type="number" 
                                    {...register('kkm', { valueAsNumber: true })}
                                    readOnly
                                    className="w-full px-3 py-2 border border-gray-200 bg-gray-100 text-gray-600 font-bold rounded-lg shadow-sm cursor-not-allowed text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                            </div>
                        )}

                        {/* Save To Bank Global Checkbox */}
                        <div className="flex items-center pt-8">
                            <label htmlFor="exam-save-to-bank" className="flex items-center gap-3 cursor-pointer select-none px-4 py-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all shadow-sm group">
                                <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors bg-white overflow-hidden">
                                    <input 
                                        id="exam-save-to-bank"
                                        type="checkbox" 
                                        {...register('saveToBank')}
                                        className="peer appearance-none w-full h-full cursor-pointer absolute inset-0 z-10 opacity-0"
                                    />
                                    <div className="absolute inset-0 bg-blue-600 opacity-0 peer-checked:opacity-100 transition-opacity flex items-center justify-center">
                                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-gray-600 group-hover:text-blue-700 transition-colors">Simpan Ke Bank Soal</span>
                            </label>
                        </div>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                        <p className="text-xs font-semibold text-blue-800">Sinkronisasi Nilai</p>
                        <p className="text-xs text-blue-700">{scoreSyncCopy}</p>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setEditorStage('QUESTIONS')}
                            className="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors"
                        >
                            Lanjut ke Butir Soal
                        </button>
                    </div>
                </div>
                ) : (
                <div className="px-6 py-3 bg-slate-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-700">
                        <span className="font-semibold">{selectedSubjectName}</span>
                        <span className="text-slate-500"> • {examTypeDisplayLabel}</span>
                        <span className="text-slate-500"> • {selectedPacketSemester === 'ODD' ? 'Ganjil' : 'Genap'}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEditorStage('INFO')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                    >
                        Edit Informasi Ujian
                    </button>
                </div>
                )}
            </div>

            {/* MAIN CONTENT AREA - FULL WIDTH */}
            <div className="space-y-6">
                {editorStage === 'INFO' ? (
                    <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-6 md:p-8">
                        <div className="max-w-3xl">
                            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Tahap 1 aktif</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">Lengkapi informasi ujian terlebih dulu</h3>
                            <p className="mt-2 text-sm text-slate-600">
                                Setelah mapel, semester, tipe, dan instruksi sudah sesuai, lanjutkan ke tahap butir soal agar proses input lebih fokus.
                            </p>
                            <button
                                type="button"
                                onClick={() => setEditorStage('QUESTIONS')}
                                className="mt-4 inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                Buka Tahap Butir Soal
                            </button>
                        </div>
                    </div>
                ) : (
                <>
                {/* QUESTION LIST BAR (Horizontal) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-700 text-sm flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4" />
                            Daftar Soal
                        </h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setIsQuestionBankOpen(true)}
                                className="px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm"
                                title="Ambil dari Bank Soal"
                            >
                                <BookCopy className="w-4 h-4" />
                                Ambil dari Bank Soal
                            </button>
                            <button 
                                onClick={addQuestion}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm"
                                title="Tambah Soal"
                            >
                                <Plus className="w-4 h-4" />
                                Tambah Soal
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {questions.map((q, idx) => {
                            const isActive = activeQuestionId === q.id;
                            const hasContent = q.content && q.content !== '<p><br></p>';
                            return (
                                <div key={q.id} className="relative group">
                                    <button
                                        onClick={() => setActiveQuestionId(q.id)}
                                        className={`
                                            flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all relative
                                            ${isActive 
                                                ? 'bg-blue-600 text-white shadow-md' 
                                                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'}
                                        `}
                                    >
                                        {idx + 1}
                                        {/* Status Indicator Dot */}
                                        <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border-2 border-white ${hasContent ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                    </button>
                                    
                                </div>
                            );
                        })}
                        
                        <button 
                            onClick={addQuestion}
                            className="flex-shrink-0 w-8 h-8 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-400 transition-colors bg-gray-50"
                            title="Tambah Soal Baru"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {activeQuestion ? (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Question Type & Settings Toolbar */}
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="w-40">
                                    <label htmlFor="question-section" className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Kategori</label>
                                    <select
                                        id="question-section"
                                        name="section"
                                        value={section}
                                        onChange={(e) => handleSectionChange(e.target.value as 'OBJECTIVE' | 'ESSAY')}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-medium text-gray-700"
                                    >
                                        <option value="OBJECTIVE">Pilihan Ganda</option>
                                        <option value="ESSAY">Essay</option>
                                    </select>
                                </div>
                                <div className="w-48">
                                    <label htmlFor="question-type" className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Jenis Soal</label>
                                    <select
                                        id="question-type"
                                        name="type"
                                        value={activeQuestion.type}
                                        onChange={(e) => handleTypeChange(e.target.value as Question['type'])}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-medium text-gray-700"
                                        disabled={section === 'ESSAY'}
                                    >
                                        {section === 'ESSAY' ? (
                                            <option value="ESSAY">Essay</option>
                                        ) : (
                                            <>
                                                <option value="MULTIPLE_CHOICE">Pilihan Ganda</option>
                                                <option value="COMPLEX_MULTIPLE_CHOICE">Pilihan Ganda Kompleks</option>
                                                <option value="TRUE_FALSE">Benar/Salah</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div className="w-20">
                                    <label htmlFor="question-score" className="text-xs font-medium text-gray-500 mb-1 block uppercase tracking-wide">Bobot</label>
                                    <input
                                        id="question-score"
                                        name="score"
                                        type="number"
                                        min="1"
                                        value={activeQuestion.score}
                                        onChange={(e) => updateQuestion(activeQuestion.id, { score: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-center"
                                    />
                                </div>
                            </div>

                            <div className="flex items-end self-end">
                                <button 
                                    onClick={() => handleDeleteQuestion(activeQuestion.id)}
                                    className="px-4 py-2 bg-white text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300 font-medium flex items-center gap-2 text-sm shadow-sm"
                                    title="Hapus Soal"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Hapus Soal
                                </button>
                            </div>
                            
                            {/* Save To Bank Checkbox Removed - Replaced by Global Setting */}
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Question Editor */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                                    Pertanyaan No. {questions.findIndex(q => q.id === activeQuestionId) + 1}
                                </label>

                                {/* Media Preview (Top) */}
                                {(!activeQuestion.question_media_position || activeQuestion.question_media_position === 'top') && renderMediaPreview(activeQuestion)}

                                <div className="rounded-xl overflow-hidden border border-gray-200 focus-within:border-blue-500 transition-colors shadow-sm">
                                    <ReactQuill
                                        key={activeQuestion.id}
                                        theme="snow"
                                        value={activeQuestion.content}
                                        onChange={(content) => updateQuestion(activeQuestion.id, { content })}
                                        modules={modules}
                                        className="bg-white min-h-[150px]"
                                    />
                                </div>

                                {/* Media Preview (Bottom) */}
                                {activeQuestion.question_media_position === 'bottom' && renderMediaPreview(activeQuestion)}

                                {/* MEDIA CONTROLS BELOW QUESTION */}
                                <div className="flex flex-wrap items-center gap-4">
                                    <label htmlFor="upload-question-image" className="cursor-pointer flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-bold shadow-sm">
                                        <ImageIcon className="w-4 h-4" />
                                        Upload Gambar
                                        <input 
                                            id="upload-question-image"
                                            name="question_image"
                                            type="file" 
                                            accept="image/*" 
                                            className="hidden" 
                                            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'question')}
                                        />
                                    </label>
                                    
                                    <label htmlFor="upload-question-video" className="cursor-pointer flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all text-sm font-bold shadow-sm">
                                        <FileVideo className="w-4 h-4" />
                                        Upload Video
                                        <input 
                                            id="upload-question-video"
                                            name="question_video"
                                            type="file" 
                                            accept="video/*" 
                                            className="hidden" 
                                            onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                                        />
                                    </label>

                                    <div className="flex-1 min-w-[300px]">
                                        <div className="relative">
                                            <label htmlFor="youtube-url" className="sr-only">YouTube URL</label>
                                            <input
                                                id="youtube-url"
                                                name="youtube_url"
                                                type="text"
                                                placeholder="Paste Link YouTube & Tekan Enter"
                                                className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-0 focus:border-red-500 text-sm font-medium transition-colors"
                                                onKeyDown={handleYouTubeKeyDown}
                                            />
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500">
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Kisi-kisi Soal</p>
                                            <p className="text-xs text-slate-500">
                                                Lengkapi tujuan pembelajaran dan indikator agar soal terpetakan.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <input
                                                value={activeQuestionBlueprint.competency || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'competency', e.target.value)}
                                                placeholder="Kompetensi/Capaian"
                                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                            />
                                            <input
                                                value={activeQuestionBlueprint.cognitiveLevel || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'cognitiveLevel', e.target.value)}
                                                placeholder="Level kognitif (C1-C6)"
                                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                            />
                                            <input
                                                value={activeQuestionBlueprint.learningObjective || ''}
                                                onChange={(e) =>
                                                    updateQuestionBlueprintField(activeQuestion.id, 'learningObjective', e.target.value)
                                                }
                                                placeholder="Tujuan pembelajaran*"
                                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                            />
                                            <input
                                                value={activeQuestionBlueprint.indicator || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'indicator', e.target.value)}
                                                placeholder="Indikator soal*"
                                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <input
                                            value={activeQuestionBlueprint.materialScope || ''}
                                            onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'materialScope', e.target.value)}
                                            placeholder="Ruang lingkup materi"
                                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>

                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Kartu Soal</p>
                                            <p className="text-xs text-emerald-700/80">
                                                Simpan stimulus dan pembahasan untuk review kualitas butir soal.
                                            </p>
                                        </div>

                                        <textarea
                                            value={activeQuestionCard.stimulus || ''}
                                            onChange={(e) => updateQuestionCardField(activeQuestion.id, 'stimulus', e.target.value)}
                                            placeholder="Stimulus soal"
                                            rows={2}
                                            className="w-full rounded-md border border-emerald-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                                        />
                                        <textarea
                                            value={activeQuestionCard.answerRationale || ''}
                                            onChange={(e) => updateQuestionCardField(activeQuestion.id, 'answerRationale', e.target.value)}
                                            placeholder="Pembahasan / alasan jawaban benar*"
                                            rows={2}
                                            className="w-full rounded-md border border-emerald-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                                        />
                                        <textarea
                                            value={activeQuestionCard.scoringGuideline || ''}
                                            onChange={(e) => updateQuestionCardField(activeQuestion.id, 'scoringGuideline', e.target.value)}
                                            placeholder="Pedoman penskoran (terutama untuk esai)"
                                            rows={2}
                                            className="w-full rounded-md border border-emerald-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                                        />
                                        <textarea
                                            value={activeQuestionCard.distractorNotes || ''}
                                            onChange={(e) => updateQuestionCardField(activeQuestion.id, 'distractorNotes', e.target.value)}
                                            placeholder="Catatan distraktor / opsi pengecoh"
                                            rows={2}
                                            className="w-full rounded-md border border-emerald-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                                        />
                                    </div>
                                </div>

                            </div>

                            {/* Options Editor */}
                            {activeQuestion.type !== 'ESSAY' && (
                                <div className="mt-4 space-y-3">
                                    {activeQuestion.options?.map((option, idx) => (
                                        <div key={option.id} className="flex gap-2 items-start group">
                                            {/* Correct Answer Toggle Badge */}
                                            <button
                                                onClick={() => {
                                                    if (!activeQuestion.options) return;
                                                    const newOptions = activeQuestion.options.map(o => {
                                                        if (activeQuestion.type === 'MULTIPLE_CHOICE' || activeQuestion.type === 'TRUE_FALSE') {
                                                            return { ...o, isCorrect: o.id === option.id };
                                                        }
                                                        if (o.id === option.id) return { ...o, isCorrect: !o.isCorrect };
                                                        return o;
                                                    });
                                                    updateQuestion(activeQuestion.id, { options: newOptions });
                                                }}
                                                className={`
                                                    mt-0.5 w-8 h-8 flex-shrink-0 rounded-md flex items-center justify-center border transition-all font-bold text-sm
                                                    ${option.isCorrect 
                                                        ? 'bg-green-500 border-green-500 text-white shadow-sm' 
                                                        : 'bg-white border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-500'}
                                                `}
                                                title={option.isCorrect ? "Jawaban Benar" : "Tandai sebagai jawaban benar"}
                                            >
                                                {String.fromCharCode(65 + idx)}
                                            </button>
                                            
                                            {/* Option Content Input (Simple) */}
                                            <div className="flex-1 relative group/input">
                                                <label htmlFor={`option-content-${option.id}`} className="sr-only">Pilihan {String.fromCharCode(65 + idx)}</label>
                                                <input
                                                    id={`option-content-${option.id}`}
                                                    name={`option_content_${option.id}`}
                                                    type="text"
                                                    value={option.content.replace(/<[^>]*>?/gm, '')} // Strip HTML for simple input view
                                                    onChange={(e) => {
                                                        if (!activeQuestion.options) return;
                                                        const newOptions = activeQuestion.options.map(o => 
                                                            o.id === option.id ? { ...o, content: e.target.value } : o
                                                        );
                                                        updateQuestion(activeQuestion.id, { options: newOptions });
                                                    }}
                                                    className={`
                                                        w-full px-3 py-1.5 border rounded-md focus:outline-none focus:border-blue-500 text-gray-700 text-sm placeholder-gray-400 transition-all
                                                        ${option.isCorrect ? 'border-green-300 bg-green-50/10' : 'border-gray-300 bg-white'}
                                                    `}
                                                    placeholder={`Pilihan ${String.fromCharCode(65 + idx)}`}
                                                />
                                                
                                                {/* Image Preview inside option if exists */}
                                                {option.image_url && (
                                                    <div className="mt-2 relative group/img inline-block">
                                                        <img src={option.image_url} alt="Option" className="h-20 w-auto rounded border border-gray-200" />
                                                        <button 
                                                            onClick={() => handleRemoveMedia('image', option.id)}
                                                            className="absolute -top-1 -right-1 bg-white text-red-500 rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm border border-gray-200"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Upload Image Button */}
                                            <label htmlFor={`upload-option-image-${option.id}`} className="cursor-pointer mt-0.5 w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-400 transition-colors" title="Upload Gambar Opsi">
                                                <ImageIcon className="w-4 h-4" />
                                                <input 
                                                    id={`upload-option-image-${option.id}`}
                                                    name={`option_image_${option.id}`}
                                                    type="file" 
                                                    accept="image/*" 
                                                    className="hidden"
                                                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], option.id)}
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                        <div className="text-gray-400 mb-4">Belum ada soal dipilih</div>
                        <button onClick={addQuestion} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Buat Soal Pertama
                        </button>
                    </div>
                )}
                </>
                )}
            </div>

            {/* Media Upload Modal - Only used for manual triggers if needed, but we used direct inputs now */}
            {/* Keeping it minimal or removing if unused. Based on new design, we use direct inputs/buttons. */}
            {/* However, the upload functions use `mediaTarget` state, so the direct inputs update that state and call upload immediately. */}
            {isQuestionBankOpen && (
                <QuestionBankModal
                    onClose={() => setIsQuestionBankOpen(false)}
                    onSelectQuestions={handleImportQuestions}
                    initialSubjectId={selectedSubjectId ? parseInt(selectedSubjectId.toString()) : undefined}
                    initialAcademicYearId={watch('academicYearId')}
                    initialSemester={watch('semester')}
                />
            )}
        </div>
    );
};
