import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, InteractionManager, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { examApi, ExamProgramItem } from '../../../../src/features/exams/examApi';
import {
  MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY,
  MOBILE_NOTIFICATIONS_QUERY_KEY,
  MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
} from '../../../../src/features/notifications/notificationApi';
import { plainTextFromExamRichText } from '../../../../src/components/ExamHtmlContent';
import {
  ExamDisplayType,
  ExamQuestionBlueprint,
  ExamQuestionCard,
  ExamQuestionMatrixColumn,
  ExamQuestionMatrixPromptColumn,
  ExamQuestionMatrixRow,
  ExamQuestionMatrixRowCell,
  ExamQuestionType,
  TeacherExamQuestionPayload,
} from '../../../../src/features/exams/types';
import { useTeacherAssignmentsQuery } from '../../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { profileApi } from '../../../../src/features/profile/profileApi';
import { useAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

type OptionDraft = {
  id: string;
  content: string;
  isCorrect: boolean;
};

type QuestionDraft = {
  id: string;
  type: ExamQuestionType;
  content: string;
  score: string;
  options: OptionDraft[];
  matrixPromptColumns: ExamQuestionMatrixPromptColumn[];
  matrixColumns: ExamQuestionMatrixColumn[];
  matrixRows: ExamQuestionMatrixRow[];
  blueprint: ExamQuestionBlueprint;
  questionCard: ExamQuestionCard;
  reviewFeedback?: {
    questionComment?: string;
    blueprintComment?: string;
    questionCardComment?: string;
    teacherResponse?: string;
    reviewedAt?: string;
    teacherRespondedAt?: string;
    reviewer?: {
      id?: number;
      name?: string;
    };
    teacherResponder?: {
      id?: number;
      name?: string;
    };
  };
};

type EditorSection = 'INFO' | 'QUESTIONS';

const CURRICULUM_EXAM_MANAGER_LABEL = 'Wakasek Kurikulum / Sekretaris Kurikulum';
const MOBILE_EXAM_EDITOR_DRAFT_STORAGE_PREFIX = 'mobile_exam_editor_draft:';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createChoiceOptions() {
  return [
    { id: createId('opt'), content: '', isCorrect: false },
    { id: createId('opt'), content: '', isCorrect: false },
    { id: createId('opt'), content: '', isCorrect: false },
    { id: createId('opt'), content: '', isCorrect: false },
  ];
}

function createTrueFalseOptions() {
  return [
    { id: createId('opt'), content: 'Benar', isCorrect: true },
    { id: createId('opt'), content: 'Salah', isCorrect: false },
  ];
}

function createMatrixPromptColumns(): ExamQuestionMatrixPromptColumn[] {
  return [{ id: createId('matrix-prompt-col'), label: 'Pernyataan' }];
}

function createMatrixColumns(): ExamQuestionMatrixColumn[] {
  return [
    { id: createId('matrix-col'), content: 'Benar' },
    { id: createId('matrix-col'), content: 'Salah' },
  ];
}

function createMatrixRowCells(promptColumns: ExamQuestionMatrixPromptColumn[]): ExamQuestionMatrixRowCell[] {
  return promptColumns.map((column) => ({
    columnId: column.id,
    content: '',
  }));
}

function createMatrixRows(
  promptColumns: ExamQuestionMatrixPromptColumn[],
  columns: ExamQuestionMatrixColumn[],
): ExamQuestionMatrixRow[] {
  const defaultCorrectColumnId = columns[0]?.id;
  return [
    { id: createId('matrix-row'), content: '', cells: createMatrixRowCells(promptColumns), correctOptionId: defaultCorrectColumnId },
    { id: createId('matrix-row'), content: '', cells: createMatrixRowCells(promptColumns), correctOptionId: defaultCorrectColumnId },
    { id: createId('matrix-row'), content: '', cells: createMatrixRowCells(promptColumns), correctOptionId: defaultCorrectColumnId },
  ];
}

function normalizeMatrixPromptColumns(raw: unknown): ExamQuestionMatrixPromptColumn[] {
  if (!Array.isArray(raw)) return [];
  const columns: ExamQuestionMatrixPromptColumn[] = [];
  raw.forEach((item, index) => {
    const source = item && typeof item === 'object' ? (item as ExamQuestionMatrixPromptColumn) : undefined;
    const label = String(source?.label || '').trim();
    if (!label) return;
    columns.push({
      id: String(source?.id || `matrix-prompt-col-${index + 1}`),
      label,
    });
  });
  return columns;
}

function ensureMatrixPromptColumnsForEditor(raw: unknown): ExamQuestionMatrixPromptColumn[] {
  if (!Array.isArray(raw) || raw.length === 0) return createMatrixPromptColumns();
  return raw.map((item, index) => {
    const source = item && typeof item === 'object' ? (item as ExamQuestionMatrixPromptColumn) : undefined;
    return {
      id: String(source?.id || `matrix-prompt-col-${index + 1}`),
      label: String(source?.label || ''),
    };
  });
}

function normalizeMatrixColumns(raw: unknown): ExamQuestionMatrixColumn[] {
  if (!Array.isArray(raw)) return [];
  const columns: ExamQuestionMatrixColumn[] = [];
  raw.forEach((item, index) => {
    const source = item && typeof item === 'object' ? (item as ExamQuestionMatrixColumn) : undefined;
    const content = String(source?.content || '').trim();
    if (!content) return;
    columns.push({
      id: String(source?.id || `matrix-col-${index + 1}`),
      content,
    });
  });
  return columns;
}

function ensureMatrixColumnsForEditor(raw: unknown): ExamQuestionMatrixColumn[] {
  if (!Array.isArray(raw) || raw.length === 0) return createMatrixColumns();
  return raw.map((item, index) => {
    const source = item && typeof item === 'object' ? (item as ExamQuestionMatrixColumn) : undefined;
    return {
      id: String(source?.id || `matrix-col-${index + 1}`),
      content: String(source?.content || ''),
    };
  });
}

function normalizeMatrixRows(
  raw: unknown,
  promptColumns: ExamQuestionMatrixPromptColumn[],
  columns: ExamQuestionMatrixColumn[],
): ExamQuestionMatrixRow[] {
  if (!Array.isArray(raw)) return [];
  const validPromptColumnIds = new Set(promptColumns.map((column) => column.id));
  const validColumnIds = new Set(columns.map((column) => column.id));
  const defaultCorrectColumnId = columns[0]?.id;
  const rows: ExamQuestionMatrixRow[] = [];
  raw.forEach((item, index) => {
    const source = item && typeof item === 'object' ? (item as ExamQuestionMatrixRow) : undefined;
    const content = String(source?.content || '').trim();
    const cells = Array.isArray(source?.cells)
      ? source.cells
          .map((cell) => ({
            columnId: String(cell?.columnId || '').trim(),
            content: String(cell?.content || '').trim(),
          }))
          .filter((cell) => cell.columnId && validPromptColumnIds.has(cell.columnId) && cell.content)
      : [];
    if (!content && cells.length === 0) return;
    const correctOptionId = String(source?.correctOptionId || '').trim();
    rows.push({
      id: String(source?.id || `matrix-row-${index + 1}`),
      content,
      cells,
      correctOptionId:
        correctOptionId && validColumnIds.has(correctOptionId) ? correctOptionId : defaultCorrectColumnId,
    });
  });
  return rows;
}

function ensureMatrixRowsForEditor(
  raw: unknown,
  promptColumns: ExamQuestionMatrixPromptColumn[],
  columns: ExamQuestionMatrixColumn[],
): ExamQuestionMatrixRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return createMatrixRows(promptColumns, columns);
  const validColumnIds = new Set(columns.map((column) => column.id));
  const defaultCorrectColumnId = columns[0]?.id;

  return raw.map((item, index) => {
    const source = item && typeof item === 'object' ? (item as ExamQuestionMatrixRow) : undefined;
    const rowCellsByColumnId = new Map<string, string>();
    if (Array.isArray(source?.cells)) {
      source.cells.forEach((cell) => {
        const columnId = String(cell?.columnId || '').trim();
        if (!columnId) return;
        rowCellsByColumnId.set(columnId, String(cell?.content || ''));
      });
    }
    return {
      id: String(source?.id || `matrix-row-${index + 1}`),
      content: String(source?.content || ''),
      cells: promptColumns.map((column) => ({
        columnId: column.id,
        content: rowCellsByColumnId.get(column.id) || '',
      })),
      correctOptionId:
        String(source?.correctOptionId || '').trim() && validColumnIds.has(String(source?.correctOptionId || '').trim())
          ? String(source?.correctOptionId || '').trim()
          : defaultCorrectColumnId,
    };
  });
}

function buildMatrixRowDisplayText(
  row: ExamQuestionMatrixRow,
  promptColumns: ExamQuestionMatrixPromptColumn[],
): string {
  const normalizedCells = Array.isArray(row.cells) ? row.cells : [];
  const rowContent = String(row.content || '').trim();
  if (normalizedCells.length > 0) {
    const parts = promptColumns
      .map((column, index) => {
        const cell = normalizedCells.find((item) => String(item.columnId || '').trim() === column.id);
        const content = String(cell?.content || '').trim();
        if (!content) return index === 0 && rowContent ? `${column.label}: ${rowContent}` : null;
        return `${column.label}: ${content}`;
      })
      .filter((item): item is string => Boolean(item));
    if (parts.length > 0) return parts.join(' | ');
  }
  return rowContent || 'Baris tanpa isi';
}

function createQuestion(type: ExamQuestionType = 'MULTIPLE_CHOICE'): QuestionDraft {
  const matrixPromptColumns = type === 'MATRIX_SINGLE_CHOICE' ? createMatrixPromptColumns() : [];
  const matrixColumns = type === 'MATRIX_SINGLE_CHOICE' ? createMatrixColumns() : [];
  return {
    id: createId('q'),
    type,
    content: '',
    score: '1',
    matrixPromptColumns,
    matrixColumns,
    matrixRows: type === 'MATRIX_SINGLE_CHOICE' ? createMatrixRows(matrixPromptColumns, matrixColumns) : [],
    blueprint: createDefaultBlueprint(),
    questionCard: createDefaultQuestionCard(),
    options:
      type === 'ESSAY'
        ? []
        : type === 'TRUE_FALSE'
          ? createTrueFalseOptions()
          : type === 'MATRIX_SINGLE_CHOICE'
            ? []
            : createChoiceOptions(),
  };
}

function createDefaultBlueprint(): ExamQuestionBlueprint {
  return {
    competency: '',
    learningObjective: '',
    indicator: '',
    materialScope: '',
    cognitiveLevel: '',
  };
}

function createDefaultQuestionCard(): ExamQuestionCard {
  return {
    stimulus: '',
    answerRationale: '',
    scoringGuideline: '',
    distractorNotes: '',
  };
}

type MobileExamEditorDraftShape = {
  title?: string;
  description?: string;
  instructions?: string;
  selectedProgramCode?: string;
  selectedAssignmentId?: number | null;
  semester?: 'ODD' | 'EVEN';
  duration?: string;
  kkm?: string;
  saveToBank?: boolean;
  questions?: QuestionDraft[];
};

function getMobileExamEditorDraftStorageKey(userId: number) {
  return `${MOBILE_EXAM_EDITOR_DRAFT_STORAGE_PREFIX}${userId}`;
}

function getQuestionOptionLabel(index: number): string {
  return String.fromCharCode(65 + Math.max(0, index));
}

function buildDerivedQuestionStimulus(question: QuestionDraft): string {
  const sections: string[] = [];
  const questionText = plainTextFromExamRichText(String(question.content || '')).trim();
  if (questionText) {
    sections.push(questionText);
  }

  if (question.type === 'MATRIX_SINGLE_CHOICE') {
    const promptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
    const columns = normalizeMatrixColumns(question.matrixColumns);
    const rows = normalizeMatrixRows(question.matrixRows, promptColumns, columns);
    if (columns.length > 0) {
      sections.push(
        ['Pilihan jawaban:', ...columns.map((column, index) => `${index + 1}. ${String(column.content || '').trim()}`)].join('\n'),
      );
    }
    if (promptColumns.length > 0) {
      sections.push(
        ['Kolom data:', ...promptColumns.map((column, index) => `${index + 1}. ${String(column.label || '').trim()}`)].join('\n'),
      );
    }
    if (rows.length > 0) {
      sections.push(
        ['Baris grid:', ...rows.map((row, index) => `${index + 1}. ${buildMatrixRowDisplayText(row, promptColumns)}`)].join('\n'),
      );
    }
  } else {
    const optionLines = (question.options || [])
      .map((option, index) => {
        const label = getQuestionOptionLabel(index);
        const content = plainTextFromExamRichText(String(option.content || '')).trim() || 'Opsi tanpa teks';
        return `${label}. ${content}`;
      })
      .filter(Boolean);

    if (optionLines.length > 0) {
      sections.push(optionLines.join('\n'));
    }
  }

  return sections.join('\n\n').trim();
}

function buildDerivedQuestionAnswerKey(question: QuestionDraft): string {
  if (question.type === 'ESSAY') {
    return 'Jawaban esai diperiksa manual oleh guru.';
  }

  if (question.type === 'MATRIX_SINGLE_CHOICE') {
    const promptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
    const columns = normalizeMatrixColumns(question.matrixColumns);
    const rows = normalizeMatrixRows(question.matrixRows, promptColumns, columns);
    const columnContentById = new Map(columns.map((column) => [column.id, String(column.content || '').trim()]));
    return rows
      .filter((row) => row.correctOptionId)
      .map((row, index) => {
        const columnContent = columnContentById.get(String(row.correctOptionId || '').trim()) || '-';
        return `${index + 1}. ${buildMatrixRowDisplayText(row, promptColumns)} -> ${columnContent}`;
      })
      .join('\n\n')
      .trim();
  }

  const correctOptions = (question.options || []).filter((option) => option.isCorrect);
  if (correctOptions.length === 0) {
    return '';
  }

  return correctOptions
    .map((option, index) => {
      const optionIndex = (question.options || []).findIndex((candidate) => candidate.id === option.id);
      const label = getQuestionOptionLabel(optionIndex >= 0 ? optionIndex : index);
      const content = plainTextFromExamRichText(String(option.content || '')).trim() || 'Opsi benar tanpa teks';
      return `${label}. ${content}`;
    })
    .join('\n\n')
    .trim();
}

function buildDerivedQuestionCard(question: QuestionDraft): ExamQuestionCard {
  const blueprint = normalizeBlueprint(question.blueprint);
  return {
    stimulus: buildDerivedQuestionStimulus(question),
    answerRationale: String(blueprint.indicator || '').trim(),
    scoringGuideline: buildDerivedQuestionAnswerKey(question),
    distractorNotes: String(blueprint.cognitiveLevel || '').trim(),
  };
}

function normalizeBlueprint(raw: unknown): ExamQuestionBlueprint {
  if (!raw || typeof raw !== 'object') {
    return createDefaultBlueprint();
  }
  const source = raw as ExamQuestionBlueprint;
  return {
    ...createDefaultBlueprint(),
    competency: source.competency || '',
    learningObjective: source.learningObjective || '',
    indicator: source.indicator || '',
    materialScope: source.materialScope || '',
    cognitiveLevel: source.cognitiveLevel || '',
  };
}

function normalizeQuestionCard(raw: unknown): ExamQuestionCard {
  if (!raw || typeof raw !== 'object') {
    return createDefaultQuestionCard();
  }
  const source = raw as ExamQuestionCard;
  return {
    ...createDefaultQuestionCard(),
    stimulus: source.stimulus || '',
    answerRationale: source.answerRationale || '',
    scoringGuideline: source.scoringGuideline || '',
    distractorNotes: source.distractorNotes || '',
  };
}

function normalizeReviewFeedback(raw: unknown): QuestionDraft['reviewFeedback'] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const reviewer = source.reviewer && typeof source.reviewer === 'object'
    ? {
        id: Number((source.reviewer as Record<string, unknown>).id || 0) || undefined,
        name: String((source.reviewer as Record<string, unknown>).name || '').trim(),
      }
    : undefined;
  const teacherResponder = source.teacherResponder && typeof source.teacherResponder === 'object'
    ? {
        id: Number((source.teacherResponder as Record<string, unknown>).id || 0) || undefined,
        name: String((source.teacherResponder as Record<string, unknown>).name || '').trim(),
      }
    : undefined;
  const normalized = {
    questionComment: String(source.questionComment || '').trim(),
    blueprintComment: String(source.blueprintComment || '').trim(),
    questionCardComment: String(source.questionCardComment || '').trim(),
    teacherResponse: String(source.teacherResponse || '').trim(),
    reviewedAt: String(source.reviewedAt || '').trim(),
    teacherRespondedAt: String(source.teacherRespondedAt || '').trim(),
    reviewer: reviewer?.name ? reviewer : undefined,
    teacherResponder: teacherResponder?.name ? teacherResponder : undefined,
  };
  if (
    !normalized.questionComment &&
    !normalized.blueprintComment &&
    !normalized.questionCardComment &&
    !normalized.teacherResponse
  ) {
    return undefined;
  }
  return normalized;
}

function parsePacketId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseExamType(raw: string | string[] | undefined): ExamDisplayType | null {
  const value = String(Array.isArray(raw) ? raw[0] : raw || '')
    .trim()
    .toUpperCase();
  if (!value) return null;
  if (value === 'QUIZ') return 'FORMATIF';
  return value;
}

function normalizeProgramCode(raw: string | string[] | undefined): string | null {
  const value = String(Array.isArray(raw) ? raw[0] : raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return value || null;
}

function assertFixedSemesterMatch(fixedSemester: 'ODD' | 'EVEN' | null | undefined, semester: 'ODD' | 'EVEN') {
  if (fixedSemester && semester !== fixedSemester) {
    throw new Error(`Program ini hanya boleh semester ${fixedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.`);
  }
}

function normalizeClassLevelToken(raw?: string | null): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '';
  if (value.startsWith('XII')) return 'XII';
  if (value.startsWith('XI')) return 'XI';
  if (value.startsWith('X')) return 'X';
  return value;
}

function getScoreSyncHint(program?: ExamProgramItem | null): string {
  if (!program) {
    return 'Nilai ujian otomatis tersinkron ke komponen nilai sesuai konfigurasi Program Ujian.';
  }

  const componentLabel = String(
    program.gradeComponentLabel || program.shortLabel || program.label || program.gradeComponentCode || program.code,
  )
    .trim()
    .toUpperCase();
  const entryModeCode = normalizeProgramCode(program.gradeEntryModeCode || program.gradeEntryMode);
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

function resolveProgramExamType(program?: ExamProgramItem | null, fallback: ExamDisplayType = 'FORMATIF'): ExamDisplayType {
  const baseType = parseExamType(program?.baseTypeCode || program?.baseType);
  if (baseType) return baseType;
  const componentType = normalizeProgramCode(program?.gradeComponentTypeCode || program?.gradeComponentType);
  if (componentType === 'FORMATIVE') return 'FORMATIF';
  return fallback;
}

function parseQuestions(raw: unknown): QuestionDraft[] {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [createQuestion()];

  const mapped = source
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const q = item as Record<string, unknown>;
      const type = String(q.type || q.question_type || 'MULTIPLE_CHOICE').toUpperCase() as ExamQuestionType;
      const matrixPromptColumns = normalizeMatrixPromptColumns(
        q.matrixPromptColumns || (q.metadata as Record<string, unknown> | undefined)?.matrixPromptColumns,
      );
      const matrixColumns = normalizeMatrixColumns(
        q.matrixColumns || (q.metadata as Record<string, unknown> | undefined)?.matrixColumns,
      );
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      const options = rawOptions
        .filter((option) => option && typeof option === 'object')
        .map((option) => {
          const data = option as Record<string, unknown>;
          return {
            id: String(data.id || createId('opt')),
            content: plainTextFromExamRichText(String(data.content || data.option_text || '')),
            isCorrect: Boolean(data.isCorrect),
          };
        });

      return {
        id: String(q.id || `q-${idx + 1}`),
        type,
        content: plainTextFromExamRichText(String(q.content || q.question_text || '')),
        score: String(typeof q.score === 'number' ? q.score : 1),
        matrixPromptColumns,
        matrixColumns,
        matrixRows: normalizeMatrixRows(
          q.matrixRows || (q.metadata as Record<string, unknown> | undefined)?.matrixRows,
          matrixPromptColumns,
          matrixColumns,
        ),
        blueprint: normalizeBlueprint(q.blueprint || (q.metadata as Record<string, unknown> | undefined)?.blueprint),
        questionCard: normalizeQuestionCard(
          q.questionCard || (q.metadata as Record<string, unknown> | undefined)?.questionCard,
        ),
        reviewFeedback: normalizeReviewFeedback(
          q.reviewFeedback || (q.metadata as Record<string, unknown> | undefined)?.reviewFeedback,
        ),
        options:
          type === 'ESSAY'
            ? []
            : type === 'MATRIX_SINGLE_CHOICE'
              ? []
            : type === 'TRUE_FALSE'
              ? options.length > 0
                ? options.slice(0, 2)
                : createTrueFalseOptions()
              : options.length > 0
                ? options
                : createChoiceOptions(),
      };
    });

  return mapped.length > 0 ? mapped : [createQuestion()];
}

function sanitizeQuestions(questions: QuestionDraft[]): TeacherExamQuestionPayload[] {
  return questions.map((question, idx) => {
    const score = Number(question.score);
    const normalizedScore = Number.isNaN(score) || score <= 0 ? 1 : score;

    const payload: TeacherExamQuestionPayload = {
      id: question.id || `q-${idx + 1}`,
      type: question.type,
      content: question.content.trim(),
      score: normalizedScore,
      matrixPromptColumns:
        question.type === 'MATRIX_SINGLE_CHOICE'
          ? normalizeMatrixPromptColumns(question.matrixPromptColumns)
          : undefined,
      matrixColumns:
        question.type === 'MATRIX_SINGLE_CHOICE' ? normalizeMatrixColumns(question.matrixColumns) : undefined,
      matrixRows:
        question.type === 'MATRIX_SINGLE_CHOICE'
          ? normalizeMatrixRows(
              question.matrixRows,
              normalizeMatrixPromptColumns(question.matrixPromptColumns),
              normalizeMatrixColumns(question.matrixColumns),
            )
          : undefined,
      blueprint: normalizeBlueprint(question.blueprint),
      questionCard: buildDerivedQuestionCard(question),
    };

    if (question.type !== 'ESSAY' && question.type !== 'MATRIX_SINGLE_CHOICE') {
      payload.options = question.options
        .map((option, optIdx) => ({
          id: option.id || `${payload.id}-opt-${optIdx + 1}`,
          content: option.content.trim(),
          isCorrect: option.isCorrect,
        }))
        .filter((option) => option.content.length > 0);
    }

    return payload;
  });
}

export default function TeacherExamEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    packetId?: string | string[];
    examType?: string | string[];
    programCode?: string | string[];
    section?: string | string[];
    questionId?: string | string[];
  }>();
  const packetId = useMemo(() => parsePacketId(params.packetId), [params.packetId]);
  const isEditMode = !!packetId;
  const forcedProgramCode = useMemo(() => {
    if (isEditMode) return null;
    return normalizeProgramCode(params.programCode) || normalizeProgramCode(params.examType);
  }, [isEditMode, params.programCode, params.examType]);
  const { isAuthenticated, isLoading, user } = useAuth();
  const draftPromptShownRef = useRef(false);
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteDraftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftRef = useRef<MobileExamEditorDraftShape>({});
  const currentPreferencesRef = useRef<Record<string, unknown>>(
    user?.preferences && typeof user.preferences === 'object' ? user.preferences : {},
  );
  const pageContentPadding = getStandardPagePadding(insets);
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const headingTextStyle = useMemo(
    () => ({ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28) }),
    [scaleFont, scaleLineHeight],
  );
  const bodyTextStyle = useMemo(
    () => ({ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }),
    [scaleFont, scaleLineHeight],
  );
  const helperTextStyle = useMemo(
    () => ({ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }),
    [scaleFont, scaleLineHeight],
  );
  const compactChipTextStyle = useMemo(
    () => ({ fontSize: scaleFont(10), lineHeight: scaleLineHeight(14) }),
    [scaleFont, scaleLineHeight],
  );
  const inputTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignments = useMemo(
    () => teacherAssignmentsQuery.data?.assignments || [],
    [teacherAssignmentsQuery.data?.assignments],
  );

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-teacher-exam-editor-programs', teacherAssignmentsQuery.data?.activeYear?.id],
    enabled: isAuthenticated && Boolean(teacherAssignmentsQuery.data?.activeYear?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: teacherAssignmentsQuery.data?.activeYear?.id,
        roleContext: 'teacher',
      }),
  });

  const availablePrograms = useMemo(
    () =>
      (examProgramsQuery.data?.programs || [])
        .filter((program: ExamProgramItem) => program.isActive && program.showOnTeacherMenu)
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code)),
    [examProgramsQuery.data?.programs],
  );

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedProgramCode, setSelectedProgramCode] = useState<string>(forcedProgramCode || '');
  const [examType, setExamType] = useState<ExamDisplayType>('FORMATIF');
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>('ODD');
  const [duration, setDuration] = useState('60');
  const [kkm, setKkm] = useState('75');
  const [saveToBank, setSaveToBank] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [reviewReplyDrafts, setReviewReplyDrafts] = useState<Record<string, string>>({});
  const [reviewReplySubmittingQuestionId, setReviewReplySubmittingQuestionId] = useState<string | null>(null);
  const [hydratedPacket, setHydratedPacket] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSection>('INFO');
  const [renderedSection, setRenderedSection] = useState<EditorSection>('INFO');
  const [sectionTransitioning, setSectionTransitioning] = useState(false);
  const syncedRequestedSectionRef = useRef<EditorSection | null>(null);
  const sectionTransitionTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const requestedQuestionId = useMemo(() => {
    const rawQuestionId = Array.isArray(params.questionId) ? params.questionId[0] : params.questionId;
    const normalized = String(rawQuestionId || '').trim();
    return normalized || null;
  }, [params.questionId]);
  const requestedSection = useMemo(() => {
    const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
    const normalizedSection = String(rawSection || '').trim().toUpperCase();
    if (normalizedSection === 'QUESTIONS') return 'QUESTIONS' as const;
    if (requestedQuestionId) return 'QUESTIONS' as const;
    return 'INFO' as const;
  }, [params.section, requestedQuestionId]);
  const selectedProgram = useMemo(
    () =>
      availablePrograms.find((program) => normalizeProgramCode(program.code) === normalizeProgramCode(selectedProgramCode)) ||
      null,
    [availablePrograms, selectedProgramCode],
  );
  const allowedSubjectIdsByProgram = useMemo(() => {
    const ids = Array.isArray(selectedProgram?.allowedSubjectIds) ? selectedProgram.allowedSubjectIds : [];
    return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0));
  }, [selectedProgram]);
  const allowedClassLevelsByProgram = useMemo(() => {
    const levels = Array.isArray(selectedProgram?.targetClassLevels) ? selectedProgram.targetClassLevels : [];
    return new Set(levels.map((level) => normalizeClassLevelToken(String(level || ''))).filter(Boolean));
  }, [selectedProgram]);
  const filteredAssignments = useMemo(() => {
    if (!selectedProgram) return assignments;
    return assignments.filter((assignment) => {
      const allowedSubject =
        allowedSubjectIdsByProgram.size === 0 ||
        allowedSubjectIdsByProgram.has(Number(assignment.subject?.id));
      if (!allowedSubject) return false;

      const assignmentLevel = normalizeClassLevelToken(assignment.class?.level);
      return allowedClassLevelsByProgram.size === 0 || Boolean(assignmentLevel && allowedClassLevelsByProgram.has(assignmentLevel));
    });
  }, [selectedProgram, allowedSubjectIdsByProgram, allowedClassLevelsByProgram, assignments]);
  const assignmentOptions = useMemo(
    () =>
      filteredAssignments.map((assignment) => ({
        value: String(assignment.id),
        label: `${assignment.subject.name} • ${assignment.class.name}`,
      })),
    [filteredAssignments],
  );
  const programOptions = useMemo(
    () =>
      availablePrograms.map((program) => ({
        value: normalizeProgramCode(program.code) || '',
        label: String(program.label || program.shortLabel || program.code).trim() || String(program.code),
      })),
    [availablePrograms],
  );
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );
  const lockedSemester = (selectedProgram?.fixedSemester as 'ODD' | 'EVEN' | null) || null;
  const isTypeLockedFromMenu = !isEditMode && !!forcedProgramCode;
  const scoreSyncHint = useMemo(
    () => String(selectedProgram?.description || '').trim() || getScoreSyncHint(selectedProgram),
    [selectedProgram],
  );

  useEffect(() => {
    if (user?.preferences && typeof user.preferences === 'object') {
      currentPreferencesRef.current = user.preferences;
    }
  }, [user?.preferences]);

  useEffect(() => {
    latestDraftRef.current = {
      title,
      description,
      instructions,
      selectedProgramCode,
      selectedAssignmentId,
      semester,
      duration,
      kkm,
      saveToBank,
      questions,
    };
  }, [
    description,
    duration,
    instructions,
    kkm,
    questions,
    saveToBank,
    selectedAssignmentId,
    selectedProgramCode,
    semester,
    title,
  ]);

  useEffect(() => {
    if (filteredAssignments.length === 0) {
      if (selectedAssignmentId !== null) {
        const timerId = setTimeout(() => setSelectedAssignmentId(null), 0);
        return () => clearTimeout(timerId);
      }
      return;
    }
    const stillValid = filteredAssignments.some((assignment) => assignment.id === selectedAssignmentId);
    if (!stillValid) {
      const timerId = setTimeout(() => setSelectedAssignmentId(filteredAssignments[0].id), 0);
      return () => clearTimeout(timerId);
    }
  }, [selectedAssignmentId, filteredAssignments]);

  useEffect(() => {
    if (isEditMode) return;
    if (forcedProgramCode) {
      const timerId = setTimeout(() => setSelectedProgramCode(forcedProgramCode), 0);
      return () => clearTimeout(timerId);
    }
    if (!selectedProgramCode && availablePrograms.length > 0) {
      const timerId = setTimeout(
        () => setSelectedProgramCode(normalizeProgramCode(availablePrograms[0].code) || ''),
        0,
      );
      return () => clearTimeout(timerId);
    }
  }, [isEditMode, forcedProgramCode, selectedProgramCode, availablePrograms]);

  useEffect(() => {
    if (!selectedProgram) {
      if (!availablePrograms.length) return;
      const fallbackCode = normalizeProgramCode(availablePrograms[0].code);
      if (fallbackCode && fallbackCode !== selectedProgramCode) {
        const timerId = setTimeout(() => setSelectedProgramCode(fallbackCode), 0);
        return () => clearTimeout(timerId);
      }
      return;
    }
    const nextType = resolveProgramExamType(selectedProgram, examType || 'FORMATIF');
    if (examType !== nextType) {
      const timerId = setTimeout(() => setExamType(nextType), 0);
      return () => clearTimeout(timerId);
    }
  }, [selectedProgram, availablePrograms, selectedProgramCode, examType]);

  useEffect(() => {
    if (syncedRequestedSectionRef.current === requestedSection) return;
    syncedRequestedSectionRef.current = requestedSection;
    setActiveSection(requestedSection);
  }, [requestedSection]);

  useEffect(() => {
    sectionTransitionTaskRef.current?.cancel();
    sectionTransitionTaskRef.current = null;

    if (activeSection === 'QUESTIONS') {
      setSectionTransitioning(true);
      sectionTransitionTaskRef.current = InteractionManager.runAfterInteractions(() => {
        startTransition(() => {
          setRenderedSection('QUESTIONS');
          setSectionTransitioning(false);
          sectionTransitionTaskRef.current = null;
        });
      });
      return () => {
        sectionTransitionTaskRef.current?.cancel();
        sectionTransitionTaskRef.current = null;
      };
    }

    startTransition(() => {
      setRenderedSection('INFO');
      setSectionTransitioning(false);
    });

    return () => {
      sectionTransitionTaskRef.current?.cancel();
      sectionTransitionTaskRef.current = null;
    };
  }, [activeSection]);

  useEffect(() => {
    if (lockedSemester && semester !== lockedSemester) {
      const timerId = setTimeout(() => setSemester(lockedSemester), 0);
      return () => clearTimeout(timerId);
    }
  }, [lockedSemester, semester]);

  const packetDetailQuery = useQuery({
    queryKey: ['mobile-teacher-exam-packet-detail', packetId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!packetId,
    queryFn: async () => examApi.getTeacherPacketById(packetId!),
    retry: 1,
  });
  const currentPacketDetail = packetDetailQuery.data || null;
  const isCurriculumManagedPacket = Boolean(currentPacketDetail?.isCurriculumManaged);
  const supportsQuestionSupport = isCurriculumManagedPacket;
  const curriculumScheduledClassNames = useMemo(() => {
    const classNames = (currentPacketDetail?.schedules || [])
      .map((schedule) => String(schedule.class?.name || '').trim())
      .filter((name) => Boolean(name));
    return Array.from(new Set(classNames));
  }, [currentPacketDetail?.schedules]);
  const curriculumPublishedQuestionLabel = useMemo(() => {
    const publishedCount = Number(currentPacketDetail?.publishedQuestionCount);
    if (Number.isFinite(publishedCount) && publishedCount > 0) {
      return `${publishedCount} soal`;
    }
    return 'Semua soal ditampilkan';
  }, [currentPacketDetail?.publishedQuestionCount]);

  useEffect(() => {
    if (!isEditMode || !packetDetailQuery.data || hydratedPacket) return;

    const packet = packetDetailQuery.data;
    const timerId = setTimeout(() => {
      setTitle(packet.title || '');
      setDescription(packet.description || '');
      setInstructions(packet.instructions || '');
      setSelectedProgramCode(normalizeProgramCode(packet.programCode || packet.type) || '');
      setExamType((String(packet.type).toUpperCase() as ExamDisplayType) || 'FORMATIF');
      setSemester((String(packet.semester).toUpperCase() as 'ODD' | 'EVEN') || 'ODD');
      setDuration(String(packet.duration || 60));
      setKkm(String(packet.kkm || 75));
      setQuestions(parseQuestions(packet.questions));

      if (assignments.length > 0) {
        const matched = assignments.find(
          (assignment) =>
            assignment.subject.id === packet.subject.id &&
            (!packet.academicYear?.id || assignment.academicYear.id === packet.academicYear.id),
        );
        if (matched) {
          setSelectedAssignmentId(matched.id);
        }
      }

      setHydratedPacket(true);
    }, 0);
    return () => clearTimeout(timerId);
  }, [isEditMode, packetDetailQuery.data, hydratedPacket, assignments]);

  useEffect(() => {
    if (isEditMode || !user?.id || draftPromptShownRef.current) return;

    let cancelled = false;
    const draftKey = getMobileExamEditorDraftStorageKey(user.id);

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (cancelled || !raw) return;

        const parsed = JSON.parse(raw) as { draft?: MobileExamEditorDraftShape } | MobileExamEditorDraftShape;
        const draft =
          parsed && typeof parsed === 'object' && 'draft' in parsed
            ? (parsed.draft as MobileExamEditorDraftShape | undefined)
            : (parsed as MobileExamEditorDraftShape | undefined);

        if (!draft) return;

        const hasQuestions = Array.isArray(draft.questions) && draft.questions.length > 0;
        const hasTitle = Boolean(String(draft.title || '').trim());
        if (!hasQuestions && !hasTitle) return;

        draftPromptShownRef.current = true;
        Alert.alert(
          'Lanjutkan Draft?',
          'Ditemukan draft ujian yang belum tersimpan. Apakah Anda ingin melanjutkan draft tersebut?',
          [
            {
              text: 'Buang',
              style: 'destructive',
              onPress: () => {
                void AsyncStorage.removeItem(draftKey);
              },
            },
            {
              text: 'Lanjutkan',
              onPress: () => {
                setTitle(String(draft.title || ''));
                setDescription(String(draft.description || ''));
                setInstructions(String(draft.instructions || ''));
                setSelectedProgramCode(forcedProgramCode || String(draft.selectedProgramCode || ''));
                setSelectedAssignmentId(
                  Number.isFinite(Number(draft.selectedAssignmentId))
                    ? Number(draft.selectedAssignmentId)
                    : null,
                );
                setSemester(
                  lockedSemester ||
                    (draft.semester === 'ODD' || draft.semester === 'EVEN' ? draft.semester : 'ODD'),
                );
                setDuration(String(draft.duration || '60'));
                setKkm(String(draft.kkm || '75'));
                setSaveToBank(Boolean(draft.saveToBank));

                if (Array.isArray(draft.questions) && draft.questions.length > 0) {
                  const restoredQuestions = draft.questions.map((question, index) => {
                    const normalizedType = String(question.type || 'MULTIPLE_CHOICE').toUpperCase() as ExamQuestionType;
                    const normalizedMatrixPromptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
                    const normalizedMatrixColumns = normalizeMatrixColumns(question.matrixColumns);
                    const normalizedOptions =
                      normalizedType === 'ESSAY'
                        ? []
                        : normalizedType === 'MATRIX_SINGLE_CHOICE'
                          ? []
                        : normalizedType === 'TRUE_FALSE'
                          ? (question.options || []).length > 0
                            ? (question.options || []).slice(0, 2)
                            : createTrueFalseOptions()
                          : (question.options || []).length > 0
                            ? (question.options || [])
                            : createChoiceOptions();

                    return {
                      id: String(question.id || `q-${index + 1}`),
                      type: normalizedType,
                      content: String(question.content || ''),
                      score: String(question.score || '1'),
                      matrixPromptColumns: normalizedMatrixPromptColumns,
                      matrixColumns: normalizedMatrixColumns,
                      matrixRows: normalizeMatrixRows(
                        question.matrixRows,
                        normalizedMatrixPromptColumns,
                        normalizedMatrixColumns,
                      ),
                      blueprint: normalizeBlueprint(question.blueprint),
                      questionCard: normalizeQuestionCard(question.questionCard),
                      reviewFeedback: normalizeReviewFeedback(question.reviewFeedback),
                      options: normalizedOptions.map((option, optionIndex) => ({
                        id: String(option.id || `${question.id || `q-${index + 1}`}-opt-${optionIndex + 1}`),
                        content: String(option.content || ''),
                        isCorrect: Boolean(option.isCorrect),
                      })),
                    } satisfies QuestionDraft;
                  });
                  setQuestions(restoredQuestions);
                }
              },
            },
          ],
        );
      } catch {
        // Ignore invalid draft payload.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forcedProgramCode, isEditMode, lockedSemester, user?.id]);

  useEffect(() => {
    if (isEditMode || !user?.id) return;

    const draftKey = getMobileExamEditorDraftStorageKey(user.id);
    const hasQuestionContent = questions.some((question) => {
      if (String(question.content || '').trim()) return true;
      if ((question.matrixColumns || []).some((column) => String(column.content || '').trim())) return true;
      if ((question.matrixRows || []).some((row) => String(row.content || '').trim())) return true;
      return (question.options || []).some((option) => String(option.content || '').trim());
    });
    const hasTitle = Boolean(title.trim());

    if (!hasQuestionContent && !hasTitle) {
      void AsyncStorage.removeItem(draftKey);
      return;
    }

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      const payload = {
        updatedAt: new Date().toISOString(),
        draft: {
          title,
          description,
          instructions,
          selectedProgramCode,
          selectedAssignmentId,
          semester,
          duration,
          kkm,
          saveToBank,
          questions,
        } satisfies MobileExamEditorDraftShape,
      };
      void AsyncStorage.setItem(draftKey, JSON.stringify(payload));
    }, 800);

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, [
    description,
    duration,
    instructions,
    isEditMode,
    kkm,
    questions,
    saveToBank,
    selectedAssignmentId,
    selectedProgramCode,
    semester,
    title,
    user?.id,
  ]);

  useEffect(() => {
    if (isEditMode || !user?.id) return;

    const hasQuestionContent = questions.some((question) => {
      if (String(question.content || '').trim()) return true;
      return (question.options || []).some((option) => String(option.content || '').trim());
    });
    const hasTitle = Boolean(title.trim());
    if (!hasQuestionContent && !hasTitle) return;

    if (remoteDraftSaveTimeoutRef.current) {
      clearTimeout(remoteDraftSaveTimeoutRef.current);
    }

    remoteDraftSaveTimeoutRef.current = setTimeout(() => {
      const payload = {
        updatedAt: new Date().toISOString(),
        draft: latestDraftRef.current,
      };
      const nextPreferences = {
        ...currentPreferencesRef.current,
        exam_draft: payload,
      };
      currentPreferencesRef.current = nextPreferences;
      void profileApi.updateSelf(user.id, {
        preferences: nextPreferences,
      }).catch(() => {
        // Keep local draft as fallback when remote save fails.
      });
    }, 2000);

    return () => {
      if (remoteDraftSaveTimeoutRef.current) {
        clearTimeout(remoteDraftSaveTimeoutRef.current);
      }
    };
  }, [isEditMode, questions, title, user?.id]);

  useEffect(() => {
    if (isEditMode || !user?.id) return;

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
      if (remoteDraftSaveTimeoutRef.current) {
        clearTimeout(remoteDraftSaveTimeoutRef.current);
      }

      const latestDraft = latestDraftRef.current;
      const hasQuestionContent = (latestDraft.questions || []).some((question) => {
        if (String(question.content || '').trim()) return true;
        if ((question.matrixColumns || []).some((column) => String(column.content || '').trim())) return true;
        if ((question.matrixRows || []).some((row) => String(row.content || '').trim())) return true;
        return (question.options || []).some((option) => String(option.content || '').trim());
      });
      const hasTitle = Boolean(String(latestDraft.title || '').trim());
      if (!hasQuestionContent && !hasTitle) return;

      const payload = {
        updatedAt: new Date().toISOString(),
        draft: latestDraft,
      };
      const nextPreferences = {
        ...currentPreferencesRef.current,
        exam_draft: payload,
      };
      currentPreferencesRef.current = nextPreferences;
      void profileApi.updateSelf(user.id, {
        preferences: nextPreferences,
      }).catch(() => {
        // Local draft remains available from AsyncStorage.
      });
    };
  }, [isEditMode, user?.id]);

  useEffect(() => {
    setReviewReplyDrafts((current) => {
      let changed = false;
      const next = { ...current };
      questions.forEach((question) => {
        if (!question.reviewFeedback) return;
        if (next[question.id] === undefined) {
          next[question.id] = String(question.reviewFeedback.teacherResponse || '');
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [questions]);

  const selectedAssignment =
    filteredAssignments.find((assignment) => assignment.id === selectedAssignmentId) || null;

  const submitReviewReply = async (question: QuestionDraft) => {
    if (!packetId) {
      Alert.alert('Info', 'Paket ujian belum tersedia.');
      return;
    }
    const teacherResponse = String(reviewReplyDrafts[question.id] || '').trim();
    if (!teacherResponse) {
      Alert.alert('Info', 'Balasan guru wajib diisi.');
      return;
    }
    setReviewReplySubmittingQuestionId(question.id);
    try {
      const result = await examApi.replyPacketReviewFeedback(packetId, {
        questionId: String(question.id || ''),
        teacherResponse,
      });
      const nextFeedback = normalizeReviewFeedback(result.reviewFeedback);
      setQuestions((current) =>
        current.map((item) =>
          item.id === question.id
            ? {
                ...item,
                reviewFeedback: nextFeedback,
              }
            : item,
        ),
      );
      await queryClient.invalidateQueries({
        queryKey: MOBILE_NOTIFICATIONS_QUERY_KEY,
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: MOBILE_NOTIFICATIONS_INBOX_QUERY_KEY,
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: MOBILE_NOTIFICATIONS_UNREAD_QUERY_KEY,
        refetchType: 'active',
      });
      Alert.alert('Berhasil', 'Balasan review berhasil dikirim ke kurikulum.');
    } catch (error) {
      Alert.alert('Gagal', error instanceof Error ? error.message : 'Gagal mengirim balasan review.');
    } finally {
      setReviewReplySubmittingQuestionId(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isCurriculumManagedPacket && !currentPacketDetail) {
        throw new Error('Detail packet kurikulum belum siap.');
      }
      if (!isCurriculumManagedPacket && !selectedAssignment) throw new Error('Pilih kelas/mapel terlebih dahulu.');
      if (!title.trim()) throw new Error('Judul ujian wajib diisi.');

      const durationValue = Number(duration);
      if (Number.isNaN(durationValue) || durationValue < 1 || durationValue > 300) {
        throw new Error('Durasi harus antara 1 sampai 300 menit.');
      }

      const kkmValue = Number(kkm);
      if (Number.isNaN(kkmValue) || kkmValue < 0 || kkmValue > 100) {
        throw new Error('KKM harus antara 0 sampai 100.');
      }

      const cleanedQuestions = sanitizeQuestions(questions);
      if (cleanedQuestions.length === 0) {
        throw new Error('Minimal harus ada 1 soal.');
      }
      const normalizedProgramCode = normalizeProgramCode(selectedProgramCode);
      if (!isCurriculumManagedPacket && !normalizedProgramCode) {
        throw new Error('Program ujian belum dipilih.');
      }

      cleanedQuestions.forEach((question, idx) => {
        if (!question.content.trim()) {
          throw new Error(`Isi soal nomor ${idx + 1} masih kosong.`);
        }

        if (supportsQuestionSupport) {
          const blueprint = normalizeBlueprint(question.blueprint);
          if (!String(blueprint.learningObjective || '').trim() || !String(blueprint.indicator || '').trim()) {
            throw new Error(
              `Soal nomor ${idx + 1} wajib mengisi kisi-kisi: tujuan pembelajaran dan indikator soal.`,
            );
          }
        }

        if (question.type !== 'ESSAY') {
          if (question.type === 'MATRIX_SINGLE_CHOICE') {
            const matrixPromptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
            const matrixColumns = normalizeMatrixColumns(question.matrixColumns);
            const matrixRows = normalizeMatrixRows(question.matrixRows, matrixPromptColumns, matrixColumns);
            if (matrixPromptColumns.length < 1) {
              throw new Error(`Soal nomor ${idx + 1} harus punya minimal 1 kolom data.`);
            }
            if (matrixColumns.length < 2) {
              throw new Error(`Soal nomor ${idx + 1} harus punya minimal 2 kolom jawaban.`);
            }
            if (matrixRows.length < 1) {
              throw new Error(`Soal nomor ${idx + 1} harus punya minimal 1 baris grid.`);
            }
            if (
              matrixRows.some(
                (row) =>
                  !String(row.content || '').trim() &&
                  !(Array.isArray(row.cells) && row.cells.some((cell) => String(cell.content || '').trim())),
              )
            ) {
              throw new Error(`Setiap baris pada soal nomor ${idx + 1} wajib memiliki isi minimal pada salah satu kolom data.`);
            }
            if (matrixRows.some((row) => !row.correctOptionId)) {
              throw new Error(`Setiap pernyataan pada soal nomor ${idx + 1} wajib punya 1 kunci jawaban.`);
            }
          } else {
            const options = question.options || [];
            if (options.length < 2) {
              throw new Error(`Soal nomor ${idx + 1} harus punya minimal 2 opsi jawaban.`);
            }
            const correctCount = options.filter((option) => option.isCorrect).length;
            if (correctCount === 0) {
              throw new Error(`Soal nomor ${idx + 1} belum punya jawaban benar.`);
            }
          }
        }
      });

      const payload = {
        title: title.trim(),
        subjectId: isCurriculumManagedPacket
          ? Number(currentPacketDetail?.subjectId || 0)
          : selectedAssignment!.subject.id,
        academicYearId: isCurriculumManagedPacket
          ? Number(currentPacketDetail?.academicYearId || 0)
          : selectedAssignment!.academicYear.id,
        type: isCurriculumManagedPacket
          ? ((currentPacketDetail?.type || examType || 'FORMATIF') as ExamDisplayType)
          : resolveProgramExamType(selectedProgram, examType || 'FORMATIF'),
        programCode: isCurriculumManagedPacket
          ? normalizeProgramCode(currentPacketDetail?.programCode || currentPacketDetail?.type) || undefined
          : normalizedProgramCode || undefined,
        semester: isCurriculumManagedPacket
          ? ((String(currentPacketDetail?.semester || semester).toUpperCase() as 'ODD' | 'EVEN') || semester)
          : semester,
        duration: isCurriculumManagedPacket ? Number(currentPacketDetail?.duration || durationValue) : durationValue,
        description: isCurriculumManagedPacket ? undefined : description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        kkm: isCurriculumManagedPacket ? Number(currentPacketDetail?.kkm || kkmValue) : kkmValue,
        saveToBank,
        questions: cleanedQuestions.map((question) => {
          if (supportsQuestionSupport) return question;
          const { blueprint, questionCard, ...restQuestion } = question;
          return restQuestion;
        }),
      };
      assertFixedSemesterMatch(lockedSemester, payload.semester);

      if (isEditMode && packetId) {
        return examApi.updateTeacherPacket(packetId, payload);
      }
      return examApi.createTeacherPacket(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-exam-packets'] });
      if (packetId) {
        await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-exam-packet-detail', packetId] });
      }
      if (!isEditMode && user?.id) {
        await AsyncStorage.removeItem(getMobileExamEditorDraftStorageKey(user.id));
        const nextPreferences = {
          ...currentPreferencesRef.current,
          exam_draft: null,
        };
        currentPreferencesRef.current = nextPreferences;
        await profileApi.updateSelf(user.id, {
          preferences: nextPreferences,
        }).catch(() => {
          // Ignore remote draft clear failures after successful save.
        });
      }
      Alert.alert('Sukses', isEditMode ? 'Packet ujian berhasil diperbarui.' : 'Packet ujian berhasil dibuat.', [
        {
          text: 'OK',
          onPress: () => router.replace('/teacher/exams'),
        },
      ]);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const message = apiError?.response?.data?.message || apiError?.message || 'Gagal menyimpan packet ujian.';
      Alert.alert('Gagal', message);
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat editor ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8 }}>Editor Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (isEditMode && packetDetailQuery.isLoading) {
    return <AppLoadingScreen message="Memuat packet ujian..." />;
  }

  if (isEditMode && (packetDetailQuery.isError || !packetDetailQuery.data)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8 }}>Editor Ujian</Text>
        <QueryStateView
          type="error"
          message="Gagal memuat detail packet ujian."
          onRetry={() => packetDetailQuery.refetch()}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={teacherAssignmentsQuery.isFetching || packetDetailQuery.isFetching}
          onRefresh={async () => {
            await teacherAssignmentsQuery.refetch();
            if (isEditMode) {
              await packetDetailQuery.refetch();
            }
          }}
        />
      }
    >
      <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 6 }}>
        {isEditMode ? 'Edit Paket Ujian' : 'Buat Paket Ujian'}
      </Text>
      <Text style={{ color: '#64748b', ...inputTextStyle, marginBottom: 12 }}>
        Susun metadata ujian dan soal secara sederhana dari mobile.
      </Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        {[
          {
            key: 'INFO' as const,
            title: 'Informasi Ujian',
            caption: 'Metadata ujian',
          },
          {
            key: 'QUESTIONS' as const,
            title: 'Kelola Butir Soal',
            caption: 'Soal & opsi jawaban',
          },
        ].map((section) => {
          const active = activeSection === section.key;
          return (
            <View key={section.key} style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => {
                  startTransition(() => setActiveSection(section.key));
                }}
                style={{
                  borderWidth: 1,
                  borderColor: active ? '#2563eb' : '#dbeafe',
                  backgroundColor: active ? '#eff6ff' : '#ffffff',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                }}
              >
                <Text
                  style={{
                    color: active ? '#1d4ed8' : '#0f172a',
                    fontWeight: '700',
                    ...bodyTextStyle,
                  }}
                >
                  {section.title}
                </Text>
                <Text
                  style={{
                    color: active ? '#1d4ed8' : '#64748b',
                    marginTop: 2,
                    ...inputTextStyle,
                  }}
                >
                  {section.caption}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {activeSection === 'INFO' ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#f8fbff',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Tahap 1: Informasi Ujian</Text>
          <Text style={{ color: '#334155', ...bodyTextStyle }}>
            {isCurriculumManagedPacket
              ? 'Judul dan instruksi masih bisa disesuaikan. Parameter lain mengikuti jadwal kurikulum.'
              : 'Lengkapi kelas/mapel, judul, tipe, semester, durasi, dan konfigurasi ujian sebelum menyusun butir soal.'}
          </Text>
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#f8fbff',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Tahap 2: Butir Soal</Text>
          <Text style={{ color: '#334155', ...bodyTextStyle }}>
            {supportsQuestionSupport
              ? 'Fokus menyusun isi soal, kisi-kisi, kartu soal, serta opsi jawaban. Informasi ujian sudah dipisahkan di tahap 1.'
              : 'Fokus menyusun isi soal dan opsi jawaban. Informasi ujian sudah dipisahkan di tahap 1.'}
          </Text>
        </View>
      )}

      {renderedSection === 'INFO' ? (
        <>
      {isCurriculumManagedPacket ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            backgroundColor: '#eff6ff',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700', marginBottom: 4 }}>Dikunci oleh Kurikulum</Text>
          <Text style={{ color: '#334155', ...bodyTextStyle }}>
            Guru hanya dapat mengubah judul ujian dan instruksi. Mapel, kelas, semester, tipe ujian, durasi, jumlah soal tampil, dan KKM mengikuti jadwal kurikulum.
          </Text>
        </View>
      ) : null}
      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
          {isCurriculumManagedPacket ? 'Informasi dari Kurikulum' : 'Kelas & Mapel'}
        </Text>
        {isCurriculumManagedPacket ? (
          <>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: '#f8fafc',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>Mapel Terjadwal</Text>
              <Text style={{ color: '#0f172a', fontWeight: '600' }}>{currentPacketDetail?.subject?.name || '-'}</Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: '#f8fafc',
              }}
            >
              <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>Kelas / Rombel Terjadwal</Text>
              <Text style={{ color: '#0f172a', fontWeight: '600' }}>
                {curriculumScheduledClassNames.length > 0
                  ? curriculumScheduledClassNames.join(', ')
                  : 'Mengikuti jadwal kurikulum'}
              </Text>
            </View>
          </>
        ) : (
          <MobileSelectField
            value={selectedAssignmentId ? String(selectedAssignmentId) : ''}
            options={assignmentOptions}
            onChange={(next) => setSelectedAssignmentId(next ? Number(next) : null)}
            placeholder="Pilih kelas dan mapel"
            helperText={
              filteredAssignments.length === 0
                ? 'Tidak ada mapel penugasan yang diizinkan untuk program ini.'
                : 'Pilihan mengikuti assignment guru yang aktif.'
            }
          />
        )}
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Judul ujian"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#fff',
          marginBottom: 8,
          ...inputTextStyle,
        }}
      />

      {!isCurriculumManagedPacket ? (
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Deskripsi ujian (opsional)"
          multiline
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 80,
            backgroundColor: '#fff',
            marginBottom: 8,
            ...inputTextStyle,
          }}
        />
      ) : null}

      <TextInput
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Instruksi ujian (opsional)"
        multiline
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 80,
          backgroundColor: '#fff',
          marginBottom: 8,
          ...inputTextStyle,
        }}
      />

      {isCurriculumManagedPacket ? (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#f8fafc',
                }}
              >
                <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>Semester</Text>
                <Text style={{ color: '#0f172a', fontWeight: '600' }}>
                  {currentPacketDetail?.semester === 'ODD' ? 'Semester Ganjil' : 'Semester Genap'}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#f8fafc',
                }}
              >
                <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>Tipe Ujian</Text>
                <Text style={{ color: '#0f172a', fontWeight: '600' }}>{selectedProgram?.label || currentPacketDetail?.programCode || currentPacketDetail?.type || '-'}</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#f8fafc',
                }}
              >
                <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>Durasi</Text>
                <Text style={{ color: '#0f172a', fontWeight: '600' }}>{currentPacketDetail?.duration || '-'} menit</Text>
              </View>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#f8fafc',
                }}
              >
                <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>KKM</Text>
                <Text style={{ color: '#0f172a', fontWeight: '600' }}>{currentPacketDetail?.kkm || '-'}</Text>
              </View>
            </View>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#f8fafc',
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 3 }}>Soal Ditampilkan ke Siswa</Text>
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>{curriculumPublishedQuestionLabel}</Text>
            <Text style={{ color: '#64748b', ...helperTextStyle, marginTop: 4 }}>
              Konfigurasi jumlah soal mengikuti packet yang dijadwalkan oleh kurikulum.
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextInput
                value={duration}
                onChangeText={setDuration}
                placeholder="Durasi (menit)"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#fff',
                  ...inputTextStyle,
                }}
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <TextInput
                value={kkm}
                onChangeText={setKkm}
                placeholder="KKM"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#fff',
                  ...inputTextStyle,
                }}
              />
            </View>
          </View>

          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Program Ujian</Text>
          {examProgramsQuery.isLoading ? (
            <QueryStateView type="loading" message="Memuat program ujian..." />
          ) : availablePrograms.length > 0 ? (
            <MobileSelectField
              value={selectedProgramCode}
              options={programOptions}
              onChange={(next) => {
                if (isTypeLockedFromMenu && forcedProgramCode && next !== forcedProgramCode) return;
                setSelectedProgramCode(next);
              }}
              placeholder="Pilih program ujian"
              helperText={isTypeLockedFromMenu ? `Program ujian dikunci sesuai menu yang dipilih: ${selectedProgram?.label || forcedProgramCode}.` : undefined}
              disabled={Boolean(isTypeLockedFromMenu)}
            />
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#fecaca',
                backgroundColor: '#fef2f2',
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: '#991b1b', ...bodyTextStyle }}>
                Program ujian belum tersedia. Minta {CURRICULUM_EXAM_MANAGER_LABEL} menambahkan Program Ujian terlebih dahulu.
              </Text>
            </View>
          )}
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Semester</Text>
          <MobileSelectField
            value={semester}
            options={semesterOptions}
            onChange={(next) => {
              if (next === 'ODD' || next === 'EVEN') {
                if (lockedSemester) return;
                setSemester(next);
              }
            }}
            placeholder="Pilih semester"
            disabled={Boolean(lockedSemester)}
          />
          {lockedSemester ? (
            <Text style={{ color: '#475569', ...helperTextStyle, marginBottom: 8 }}>
              Semester otomatis untuk {selectedProgram?.label || examType}: {lockedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.
            </Text>
          ) : null}
        </>
      )}

      <View
        style={{
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderColor: '#dbeafe',
          borderRadius: 10,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Sinkronisasi Nilai</Text>
        <Text style={{ color: '#334155', ...bodyTextStyle }}>{scoreSyncHint}</Text>
      </View>

      <Pressable
        onPress={() => setSaveToBank((prev) => !prev)}
        style={{
          backgroundColor: saveToBank ? '#dcfce7' : '#f1f5f9',
          borderWidth: 1,
          borderColor: saveToBank ? '#86efac' : '#cbd5e1',
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: saveToBank ? '#166534' : '#334155', fontWeight: '700' }}>
          {saveToBank ? 'Simpan ke bank soal: Aktif' : 'Simpan ke bank soal: Nonaktif'}
        </Text>
      </Pressable>

        </>
      ) : null}

      {activeSection === 'QUESTIONS' && sectionTransitioning ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#ffffff',
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Membuka Butir Soal</Text>
          <Text style={{ color: '#475569', ...bodyTextStyle }}>
            Editor sedang menyiapkan daftar soal agar perpindahan tab tetap lebih ringan di perangkat mobile.
          </Text>
        </View>
      ) : null}

      {renderedSection === 'QUESTIONS' && !sectionTransitioning ? (
        <>
      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Daftar Soal</Text>
      {questions.map((question, index) => {
        const isRequestedQuestion = requestedQuestionId === String(question.id || '');
        const derivedQuestionCard = buildDerivedQuestionCard(question);
        return (
        <View
          key={question.id}
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: isRequestedQuestion ? '#2563eb' : '#e2e8f0',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            shadowColor: isRequestedQuestion ? '#2563eb' : undefined,
            shadowOpacity: isRequestedQuestion ? 0.08 : 0,
            shadowRadius: isRequestedQuestion ? 6 : 0,
            elevation: isRequestedQuestion ? 1 : 0,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700' }}>Soal {index + 1}</Text>
              {isRequestedQuestion ? (
                <Text style={{ color: '#2563eb', ...helperTextStyle, marginTop: 2 }}>
                  Butir ini memiliki catatan review dari kurikulum.
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                if (questions.length <= 1) {
                  Alert.alert('Info', 'Minimal harus ada 1 soal.');
                  return;
                }
                setQuestions((prev) => prev.filter((item) => item.id !== question.id));
              }}
            >
              <Text style={{ color: '#b91c1c', fontWeight: '700', ...bodyTextStyle }}>Hapus</Text>
            </Pressable>
          </View>

          {question.reviewFeedback ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#fcd34d',
                backgroundColor: '#fffbeb',
                borderRadius: 12,
                padding: 10,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#92400e', fontWeight: '700', ...bodyTextStyle, marginBottom: 4 }}>
                Catatan Review Kurikulum
              </Text>
              {(question.reviewFeedback.reviewer?.name || question.reviewFeedback.reviewedAt) ? (
                <Text style={{ color: '#a16207', ...helperTextStyle, marginBottom: 6 }}>
                  {question.reviewFeedback.reviewer?.name
                    ? `Oleh ${question.reviewFeedback.reviewer.name}`
                    : 'Catatan tersimpan'}
                  {question.reviewFeedback.reviewedAt ? ` • ${question.reviewFeedback.reviewedAt}` : ''}
                </Text>
              ) : null}
              {question.reviewFeedback.questionComment ? (
                <Text style={{ color: '#78350f', ...bodyTextStyle, marginBottom: 4 }}>
                  Soal: {question.reviewFeedback.questionComment}
                </Text>
              ) : null}
              {question.reviewFeedback.blueprintComment ? (
                <Text style={{ color: '#78350f', ...bodyTextStyle, marginBottom: 4 }}>
                  Kisi-kisi: {question.reviewFeedback.blueprintComment}
                </Text>
              ) : null}
              {question.reviewFeedback.questionCardComment ? (
                <Text style={{ color: '#78350f', ...bodyTextStyle, marginBottom: 4 }}>
                  Kartu soal: {question.reviewFeedback.questionCardComment}
                </Text>
              ) : null}
              {question.reviewFeedback.teacherResponse ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    backgroundColor: '#eff6ff',
                    borderRadius: 10,
                    padding: 10,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle, marginBottom: 4 }}>
                    Balasan Guru
                  </Text>
                  <Text style={{ color: '#334155', ...bodyTextStyle }}>{question.reviewFeedback.teacherResponse}</Text>
                </View>
              ) : null}
              <TextInput
                value={String(reviewReplyDrafts[question.id] || '')}
                onChangeText={(value) =>
                  setReviewReplyDrafts((current) => ({
                    ...current,
                    [question.id]: value,
                  }))
                }
                placeholder="Balas catatan ke kurikulum setelah perbaikan selesai."
                multiline
                textAlignVertical="top"
                style={{
                  borderWidth: 1,
                  borderColor: '#fcd34d',
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  minHeight: 88,
                  marginTop: 10,
                  ...inputTextStyle,
                }}
              />
              <Pressable
                onPress={() => void submitReviewReply(question)}
                disabled={reviewReplySubmittingQuestionId === question.id}
                style={{
                  backgroundColor: reviewReplySubmittingQuestionId === question.id ? '#fcd34d' : '#d97706',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  marginTop: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>
                  {reviewReplySubmittingQuestionId === question.id
                    ? 'Mengirim Balasan...'
                    : 'Kirim Balasan ke Kurikulum'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: 8 }}>
            {(['MULTIPLE_CHOICE', 'COMPLEX_MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATRIX_SINGLE_CHOICE', 'ESSAY'] as ExamQuestionType[]).map(
              (typeItem) => {
                const selected = question.type === typeItem;
                return (
                  <View key={typeItem} style={{ width: '50%', paddingHorizontal: 3, marginBottom: 6 }}>
                    <Pressable
                      onPress={() => {
                        setQuestions((prev) =>
                          prev.map((item) => {
                            if (item.id !== question.id) return item;
                            if (typeItem === 'ESSAY') {
                              return {
                                ...item,
                                type: typeItem,
                                options: [],
                                matrixPromptColumns: [],
                                matrixColumns: [],
                                matrixRows: [],
                              };
                            }
                            if (typeItem === 'TRUE_FALSE') {
                              return {
                                ...item,
                                type: typeItem,
                                options: createTrueFalseOptions(),
                                matrixPromptColumns: [],
                                matrixColumns: [],
                                matrixRows: [],
                              };
                            }
                            if (typeItem === 'MATRIX_SINGLE_CHOICE') {
                              const nextPromptColumns =
                                normalizeMatrixPromptColumns(item.matrixPromptColumns).length > 0
                                  ? normalizeMatrixPromptColumns(item.matrixPromptColumns)
                                  : createMatrixPromptColumns();
                              const nextColumns =
                                normalizeMatrixColumns(item.matrixColumns).length > 0
                                  ? normalizeMatrixColumns(item.matrixColumns)
                                  : createMatrixColumns();
                              return {
                                ...item,
                                type: typeItem,
                                options: [],
                                matrixPromptColumns: nextPromptColumns,
                                matrixColumns: nextColumns,
                                matrixRows:
                                  normalizeMatrixRows(item.matrixRows, nextPromptColumns, nextColumns).length > 0
                                    ? normalizeMatrixRows(item.matrixRows, nextPromptColumns, nextColumns)
                                    : createMatrixRows(nextPromptColumns, nextColumns),
                              };
                            }
                            return {
                              ...item,
                              type: typeItem,
                              options: item.options.length > 0 ? item.options : createChoiceOptions(),
                              matrixPromptColumns: [],
                              matrixColumns: [],
                              matrixRows: [],
                            };
                          }),
                        );
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                        backgroundColor: selected ? '#eff6ff' : '#fff',
                        borderRadius: 8,
                        paddingVertical: 7,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontWeight: '700', ...compactChipTextStyle }}>
                        {typeItem === 'MULTIPLE_CHOICE'
                          ? 'Pilihan Ganda'
                          : typeItem === 'COMPLEX_MULTIPLE_CHOICE'
                            ? 'PG Kompleks'
                            : typeItem === 'TRUE_FALSE'
                              ? 'Benar/Salah'
                              : typeItem === 'MATRIX_SINGLE_CHOICE'
                                ? 'PG Grid'
                              : 'Esai'}
                      </Text>
                    </Pressable>
                  </View>
                );
              },
            )}
          </View>

          <TextInput
            value={question.content}
            onChangeText={(value) => {
              setQuestions((prev) =>
                prev.map((item) => (item.id === question.id ? { ...item, content: value } : item)),
              );
            }}
            placeholder="Tulis isi soal"
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
              minHeight: 80,
              backgroundColor: '#fff',
              marginBottom: 8,
              ...inputTextStyle,
            }}
          />

          <TextInput
            value={question.score}
            onChangeText={(value) => {
              setQuestions((prev) =>
                prev.map((item) => (item.id === question.id ? { ...item, score: value } : item)),
              );
            }}
            placeholder="Bobot skor"
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 9,
              backgroundColor: '#fff',
              marginBottom: 8,
              ...inputTextStyle,
            }}
          />

          {supportsQuestionSupport ? (
            <>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbeafe',
              backgroundColor: '#f8fbff',
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Kisi-kisi Soal</Text>
            <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Tujuan Pembelajaran
            </Text>
            <TextInput
              value={String(question.blueprint.learningObjective || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            learningObjective: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Tujuan pembelajaran*"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
                ...inputTextStyle,
              }}
              multiline
              textAlignVertical="top"
            />
            <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Indikator Soal
            </Text>
            <TextInput
              value={String(question.blueprint.indicator || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            indicator: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Indikator soal*"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
                ...inputTextStyle,
              }}
              multiline
              textAlignVertical="top"
            />
            <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Kompetensi / Capaian
            </Text>
            <TextInput
              value={String(question.blueprint.competency || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            competency: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Kompetensi / capaian"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
                ...inputTextStyle,
              }}
              multiline
              textAlignVertical="top"
            />
            <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Ruang Lingkup Materi
            </Text>
            <TextInput
              value={String(question.blueprint.materialScope || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            materialScope: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Ruang lingkup materi"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
                ...inputTextStyle,
              }}
              multiline
              textAlignVertical="top"
            />
            <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Level Kognitif
            </Text>
            <TextInput
              value={String(question.blueprint.cognitiveLevel || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            cognitiveLevel: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Level kognitif"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                ...inputTextStyle,
              }}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: '#a7f3d0',
              backgroundColor: '#ecfdf5',
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#065f46', fontWeight: '700', marginBottom: 6 }}>Kartu Soal</Text>
            <Text style={{ color: '#065f46', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Teks Soal dan Optional
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 60,
                marginBottom: 6,
              }}
            >
              <Text style={{ color: '#0f172a', ...bodyTextStyle }}>
                {String(question.content || '').trim() || 'Belum ada teks soal.'}
              </Text>
              {question.type === 'MATRIX_SINGLE_CHOICE' ? (
                <View style={{ marginTop: 8 }}>
                  {normalizeMatrixColumns(question.matrixColumns).length > 0 ? (
                    <Text style={{ color: '#334155', fontWeight: '700', ...bodyTextStyle, marginBottom: 4 }}>
                      Pilihan jawaban: {normalizeMatrixColumns(question.matrixColumns).map((column) => column.content).join(' • ')}
                    </Text>
                  ) : null}
                  {normalizeMatrixPromptColumns(question.matrixPromptColumns).length > 0 ? (
                    <Text style={{ color: '#334155', fontWeight: '700', ...bodyTextStyle, marginBottom: 4 }}>
                      Kolom data: {normalizeMatrixPromptColumns(question.matrixPromptColumns).map((column) => column.label).join(' • ')}
                    </Text>
                  ) : null}
                  {normalizeMatrixRows(
                    question.matrixRows,
                    normalizeMatrixPromptColumns(question.matrixPromptColumns),
                    normalizeMatrixColumns(question.matrixColumns),
                  ).map((row, rowIndex) => (
                    <Text key={row.id || `${question.id}-matrix-preview-${rowIndex}`} style={{ color: '#334155', ...bodyTextStyle, marginTop: 2 }}>
                      {rowIndex + 1}. {buildMatrixRowDisplayText(row, normalizeMatrixPromptColumns(question.matrixPromptColumns))}
                    </Text>
                  ))}
                </View>
              ) : null}
              {(question.options || []).length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {(question.options || []).map((option, optionIndex) => (
                    <Text key={option.id || `${question.id}-preview-${optionIndex}`} style={{ color: '#334155', ...bodyTextStyle, marginTop: 2 }}>
                      {getQuestionOptionLabel(optionIndex)}. {String(option.content || '').trim() || 'Opsi tanpa teks'}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <Text style={{ color: '#065f46', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Indikator Soal
            </Text>
            <TextInput
              value={String(derivedQuestionCard.answerRationale || '')}
              editable={false}
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 60,
                marginBottom: 6,
                color: '#0f172a',
                ...inputTextStyle,
              }}
            />

            <Text style={{ color: '#065f46', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Kunci Jawaban
            </Text>
            <TextInput
              value={String(derivedQuestionCard.scoringGuideline || '')}
              editable={false}
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 54,
                marginBottom: 6,
                color: '#0f172a',
                ...inputTextStyle,
              }}
            />

            <Text style={{ color: '#065f46', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
              Level Kognitif
            </Text>
            <TextInput
              value={String(derivedQuestionCard.distractorNotes || '')}
              editable={false}
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 54,
                color: '#0f172a',
                ...inputTextStyle,
              }}
            />
          </View>
            </>
          ) : null}

          {question.type === 'MATRIX_SINGLE_CHOICE' ? (
            (() => {
              const promptColumns = ensureMatrixPromptColumnsForEditor(question.matrixPromptColumns);
              const answerColumns = ensureMatrixColumnsForEditor(question.matrixColumns);
              const rows = ensureMatrixRowsForEditor(question.matrixRows, promptColumns, answerColumns);
              return (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbeafe',
                    backgroundColor: '#eff6ff',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Pilihan Ganda Grid</Text>
                  <Text style={{ color: '#475569', ...bodyTextStyle, marginBottom: 10 }}>
                    Struktur grid ini dinamis. Untuk bentuk tabel seperti contoh Benar/Salah, isi Kolom Data misalnya
                    Besaran, Satuan, dan Alat Ukur; lalu biarkan Kolom Jawaban berisi Benar dan Salah.
                  </Text>

                  <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 6 }}>Kolom Data</Text>
                  {promptColumns.map((column, columnIndex) => (
                    <View key={column.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#93c5fd',
                          backgroundColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 6,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', ...helperTextStyle }}>{columnIndex + 1}</Text>
                      </View>
                      <TextInput
                        value={String(column.label || '')}
                        onChangeText={(value) => {
                          const nextPromptColumns = promptColumns.map((item) =>
                            item.id === column.id ? { ...item, label: value } : item,
                          );
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    matrixPromptColumns: nextPromptColumns,
                                    matrixRows: rows.map((row) => ({
                                      ...row,
                                      cells: nextPromptColumns.map((promptColumn) => {
                                        const existingCell = Array.isArray(row.cells)
                                          ? row.cells.find((cell) => cell.columnId === promptColumn.id)
                                          : null;
                                        return {
                                          columnId: promptColumn.id,
                                          content: existingCell?.content || '',
                                        };
                                      }),
                                    })),
                                  }
                                : item,
                            ),
                          );
                        }}
                        placeholder={`Kolom data ${columnIndex + 1}`}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          backgroundColor: '#fff',
                          ...inputTextStyle,
                        }}
                      />
                      <Pressable
                        onPress={() => {
                          if (promptColumns.length <= 1) {
                            Alert.alert('Minimal 1 kolom data', 'Pilihan Ganda Grid harus memiliki minimal 1 kolom data.');
                            return;
                          }
                          const nextPromptColumns = promptColumns.filter((item) => item.id !== column.id);
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    matrixPromptColumns: nextPromptColumns,
                                    matrixRows: rows.map((row) => ({
                                      ...row,
                                      cells: (Array.isArray(row.cells) ? row.cells : []).filter((cell) => cell.columnId !== column.id),
                                    })),
                                  }
                                : item,
                            ),
                          );
                        }}
                        style={{
                          marginLeft: 6,
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          backgroundColor: '#fff1f2',
                        }}
                      >
                        <Text style={{ color: '#b91c1c', fontWeight: '700', ...bodyTextStyle }}>Hapus</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      const newColumnId = createId('matrix-prompt-col');
                      setQuestions((prev) =>
                        prev.map((item) =>
                          item.id === question.id
                            ? {
                                ...item,
                                matrixPromptColumns: [...promptColumns, { id: newColumnId, label: '' }],
                                matrixRows: rows.map((row) => ({
                                  ...row,
                                  cells: [...(Array.isArray(row.cells) ? row.cells : []), { columnId: newColumnId, content: '' }],
                                })),
                              }
                            : item,
                        ),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#1d4ed8',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#fff',
                      marginBottom: 12,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Tambah Kolom Data</Text>
                  </Pressable>

                  <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 6 }}>Kolom Jawaban</Text>
                  {answerColumns.map((column, columnIndex) => (
                    <View key={column.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#93c5fd',
                          backgroundColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 6,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', ...helperTextStyle }}>{columnIndex + 1}</Text>
                      </View>
                      <TextInput
                        value={String(column.content || '')}
                        onChangeText={(value) => {
                          const nextColumns = answerColumns.map((item) =>
                            item.id === column.id ? { ...item, content: value } : item,
                          );
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    matrixColumns: nextColumns,
                                  }
                                : item,
                            ),
                          );
                        }}
                        placeholder={`Kolom jawaban ${columnIndex + 1}`}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          backgroundColor: '#fff',
                          ...inputTextStyle,
                        }}
                      />
                      <Pressable
                        onPress={() => {
                          if (answerColumns.length <= 2) {
                            Alert.alert('Minimal 2 kolom', 'Pilihan Ganda Grid harus memiliki minimal 2 kolom jawaban.');
                            return;
                          }
                          const nextColumns = answerColumns.filter((item) => item.id !== column.id);
                          const fallbackColumnId = nextColumns[0]?.id;
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    matrixColumns: nextColumns,
                                    matrixRows: rows.map((row) => ({
                                      ...row,
                                      correctOptionId: row.correctOptionId === column.id ? fallbackColumnId : row.correctOptionId,
                                    })),
                                  }
                                : item,
                            ),
                          );
                        }}
                        style={{
                          marginLeft: 6,
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          backgroundColor: '#fff1f2',
                        }}
                      >
                        <Text style={{ color: '#b91c1c', fontWeight: '700', ...bodyTextStyle }}>Hapus</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      const nextColumns = [...answerColumns, { id: createId('matrix-col'), content: '' }];
                      const fallbackColumnId = nextColumns[0]?.id;
                      setQuestions((prev) =>
                        prev.map((item) =>
                          item.id === question.id
                            ? {
                                ...item,
                                matrixColumns: nextColumns,
                                matrixRows: rows.map((row) => ({
                                  ...row,
                                  correctOptionId: row.correctOptionId || fallbackColumnId,
                                })),
                              }
                            : item,
                        ),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#1d4ed8',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#fff',
                      marginBottom: 12,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Tambah Kolom Jawaban</Text>
                  </Pressable>

                  <Text style={{ color: '#1e3a8a', ...helperTextStyle, fontWeight: '700', marginBottom: 6 }}>Baris Grid</Text>
                  {rows.map((row, rowIndex) => (
                    <View key={row.id} style={{ borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 10, backgroundColor: '#fff', marginBottom: 8 }}>
                      <Text style={{ color: '#1e3a8a', fontWeight: '700', ...bodyTextStyle, marginBottom: 6 }}>
                        Baris {rowIndex + 1}
                      </Text>
                      {promptColumns.map((column, promptColumnIndex) => {
                        const currentCell = (Array.isArray(row.cells) ? row.cells : []).find((cell) => cell.columnId === column.id);
                        return (
                          <View key={`${row.id}-${column.id}`} style={{ marginBottom: 8 }}>
                            <Text style={{ color: '#64748b', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
                              {String(column.label || '').trim() || `Kolom ${promptColumnIndex + 1}`}
                            </Text>
                            <TextInput
                              value={String(currentCell?.content || '')}
                              onChangeText={(value) => {
                                setQuestions((prev) =>
                                  prev.map((item) =>
                                    item.id === question.id
                                      ? (() => {
                                          const nextPromptColumns = ensureMatrixPromptColumnsForEditor(item.matrixPromptColumns);
                                          const nextAnswerColumns = ensureMatrixColumnsForEditor(item.matrixColumns);
                                          const nextRows = ensureMatrixRowsForEditor(
                                            item.matrixRows,
                                            nextPromptColumns,
                                            nextAnswerColumns,
                                          ).map((candidate) => {
                                            if (candidate.id !== row.id) {
                                              return candidate;
                                            }
                                            const nextCells = nextPromptColumns.map((promptColumn) => {
                                              const existingCell = Array.isArray(candidate.cells)
                                                ? candidate.cells.find((cell) => cell.columnId === promptColumn.id)
                                                : null;
                                              return {
                                                columnId: promptColumn.id,
                                                content: promptColumn.id === column.id ? value : existingCell?.content || '',
                                              };
                                            });
                                            const primaryColumnId = nextPromptColumns[0]?.id;
                                            const primaryContent = primaryColumnId
                                              ? nextCells.find((cell) => cell.columnId === primaryColumnId)?.content || ''
                                              : '';
                                            return {
                                              ...candidate,
                                              content: primaryContent || String(candidate.content || ''),
                                              cells: nextCells,
                                            };
                                          });
                                          return { ...item, matrixRows: nextRows };
                                        })()
                                      : item,
                                  ),
                                );
                              }}
                              placeholder={`Isi ${String(column.label || '').trim() || `kolom ${promptColumnIndex + 1}`}`}
                              multiline
                              style={{
                                borderWidth: 1,
                                borderColor: '#cbd5e1',
                                borderRadius: 10,
                                paddingHorizontal: 10,
                                paddingVertical: 9,
                                backgroundColor: '#fff',
                                minHeight: 56,
                                ...inputTextStyle,
                              }}
                            />
                          </View>
                        );
                      })}
                      <Text style={{ color: '#64748b', ...helperTextStyle, fontWeight: '700', marginBottom: 4 }}>
                        Ringkasan Baris
                      </Text>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 10,
                          backgroundColor: '#f8fafc',
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: '#0f172a', ...bodyTextStyle }}>{buildMatrixRowDisplayText(row, promptColumns)}</Text>
                      </View>
                      <MobileSelectField
                        label="Kunci Jawaban Baris Ini"
                        value={String(row.correctOptionId || answerColumns[0]?.id || '')}
                        options={answerColumns.map((column) => ({
                          label: String(column.content || '').trim() || 'Kolom tanpa label',
                          value: column.id,
                        }))}
                        onChange={(value) => {
                          const nextRows = rows.map((item) =>
                            item.id === row.id ? { ...item, correctOptionId: value } : item,
                          );
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === question.id ? { ...item, matrixRows: nextRows } : item,
                            ),
                          );
                        }}
                        placeholder="Pilih kunci jawaban"
                      />
                      <Pressable
                        onPress={() => {
                          if (rows.length <= 1) {
                            Alert.alert('Minimal 1 baris', 'Pilihan Ganda Grid harus memiliki minimal 1 baris grid.');
                            return;
                          }
                          setQuestions((prev) =>
                            prev.map((item) =>
                              item.id === question.id
                                ? { ...item, matrixRows: rows.filter((candidate) => candidate.id !== row.id) }
                                : item,
                            ),
                          );
                        }}
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          backgroundColor: '#fff1f2',
                          alignSelf: 'flex-start',
                        }}
                      >
                        <Text style={{ color: '#b91c1c', fontWeight: '700', ...bodyTextStyle }}>Hapus Baris</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      const fallbackColumnId = answerColumns[0]?.id;
                      setQuestions((prev) =>
                        prev.map((item) =>
                          item.id === question.id
                            ? {
                                ...item,
                                matrixRows: [
                                  ...rows,
                                  {
                                    id: createId('matrix-row'),
                                    content: '',
                                    cells: createMatrixRowCells(promptColumns),
                                    correctOptionId: fallbackColumnId,
                                  },
                                ],
                              }
                            : item,
                        ),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#1d4ed8',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#fff',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Tambah Baris Grid</Text>
                  </Pressable>
                </View>
              );
            })()
          ) : question.type !== 'ESSAY' ? (
            <View>
              {question.options.map((option) => (
                <View key={option.id} style={{ flexDirection: 'row', marginBottom: 6 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <TextInput
                      value={option.content}
                      onChangeText={(value) => {
                        setQuestions((prev) =>
                          prev.map((item) => {
                            if (item.id !== question.id) return item;
                            return {
                              ...item,
                              options: item.options.map((candidate) =>
                                candidate.id === option.id ? { ...candidate, content: value } : candidate,
                              ),
                            };
                          }),
                        );
                      }}
                      placeholder="Isi opsi jawaban"
                      editable={question.type !== 'TRUE_FALSE'}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: question.type === 'TRUE_FALSE' ? '#f8fafc' : '#fff',
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      setQuestions((prev) =>
                        prev.map((item) => {
                          if (item.id !== question.id) return item;
                          return {
                            ...item,
                            options: item.options.map((candidate) => {
                              if (question.type === 'COMPLEX_MULTIPLE_CHOICE') {
                                return candidate.id === option.id
                                  ? { ...candidate, isCorrect: !candidate.isCorrect }
                                  : candidate;
                              }
                              return {
                                ...candidate,
                                isCorrect: candidate.id === option.id,
                              };
                            }),
                          };
                        }),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: option.isCorrect ? '#16a34a' : '#cbd5e1',
                      backgroundColor: option.isCorrect ? '#dcfce7' : '#fff',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: option.isCorrect ? '#166534' : '#334155', fontWeight: '700' }}>
                      Benar
                    </Text>
                  </Pressable>
                </View>
              ))}

              {question.type !== 'TRUE_FALSE' ? (
                <View style={{ flexDirection: 'row', marginTop: 2 }}>
                  <Pressable
                    onPress={() => {
                      setQuestions((prev) =>
                        prev.map((item) => {
                          if (item.id !== question.id) return item;
                          return {
                            ...item,
                            options: [...item.options, { id: createId('opt'), content: '', isCorrect: false }],
                          };
                        }),
                      );
                    }}
                    style={{
                      marginRight: 10,
                      borderWidth: 1,
                      borderColor: '#1d4ed8',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#eff6ff',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Tambah Opsi</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setQuestions((prev) =>
                        prev.map((item) => {
                          if (item.id !== question.id) return item;
                          if (item.options.length <= 2) return item;
                          return {
                            ...item,
                            options: item.options.slice(0, -1),
                          };
                        }),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#fff1f2',
                    }}
                  >
                    <Text style={{ color: '#b91c1c', fontWeight: '700', ...bodyTextStyle }}>Hapus Opsi</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        );
      })}

      <Pressable
        onPress={() => setQuestions((prev) => [...prev, createQuestion()])}
        style={{
          borderWidth: 1,
          borderColor: '#1d4ed8',
          backgroundColor: '#eff6ff',
          borderRadius: 9,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Tambah Soal Baru</Text>
      </Pressable>

      <Pressable
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: saveMutation.isPending ? 0.5 : 1,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>
          {saveMutation.isPending ? 'Menyimpan...' : isEditMode ? 'Simpan Perubahan' : 'Buat Packet Ujian'}
        </Text>
      </Pressable>
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/teacher/exams')}
        style={{
          backgroundColor: '#1d4ed8',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>Kembali ke Program Ujian</Text>
      </Pressable>
    </ScrollView>
  );
}
