import React, { useMemo, useState, useEffect, useRef } from 'react';
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
    LayoutGrid,
    Eye,
    Image as ImageIcon,
    X,
    FileVideo,
    BookCopy,
    Trash2,
    Undo2,
    Redo2,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { examProgramCodeToSlug, examService, normalizeExamProgramCode } from '../../../services/exam.service';
import type {
    ExamProgram,
    ExamType,
    Question,
    QuestionBlueprint,
    QuestionCard,
    QuestionMatrixPromptColumn,
    QuestionReviewFeedback,
    ExamPacket,
    QuestionMatrixColumn,
    QuestionMatrixRow,
} from '../../../services/exam.service';
import {
    teachingResourceProgramService,
    type TeachingResourceProjectedReferenceOption,
    type TeachingResourceReferenceProjectionRequest,
} from '../../../services/teachingResourceProgram.service';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';
import api from '../../../services/api';
import { QuestionBankModal } from '../../../components/teacher/exams/QuestionBankModal';
import { ExamPacketMediaAuditGuard } from '../../../components/teacher/exams/ExamPacketMediaAuditGuard';
import { ExamStudentPreviewSurface, type ExamStudentPreviewQuestion } from '../../../components/teacher/exams/ExamStudentPreviewSurface';
import { ConfirmationModal } from '../../../components/common/ConfirmationModal';
import type { UserWrite } from '../../../types/auth';
import { enhanceQuestionHtml } from '../../../utils/questionMedia';
import {
    getExamQuestionSupportSnapshot,
    getExamQuestionSupportStatusMeta,
} from '../../../lib/examQuestionSupportStatus';

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

interface ImportedQuestion extends Question {
    points?: number;
    mediaUrl?: string | null;
    media_url?: string | null;
    mediaType?: string | null;
    media_type?: string | null;
    question_image_url?: string;
    question_video_url?: string;
    question_video_type?: 'upload' | 'youtube';
    question_media_position?: 'top' | 'bottom' | 'left' | 'right';
    options?: {
        id: string;
        content: string;
        isCorrect: boolean;
        image_url?: string;
        imageUrl?: string;
    }[];
}

type TextFieldHistoryState = {
    past: string[];
    future: string[];
};

type BlueprintReferenceField = 'competency' | 'learningObjective' | 'indicator' | 'materialScope';

type BlueprintReferenceOption = TeachingResourceProjectedReferenceOption & {
    optionKey: string;
};

const BLUEPRINT_REFERENCE_PROGRAM_CODES = ['CP', 'ATP', 'PROTA', 'KKTP'];

const BLUEPRINT_REFERENCE_REQUEST_CONFIGS: Array<{
    requestKey: string;
    sourceProgramCode: string;
    candidates: string[];
}> = [
    {
        requestKey: 'blueprint:competency:cp',
        sourceProgramCode: 'CP',
        candidates: ['capaian_pembelajaran', 'kompetensi', 'elemen'],
    },
    {
        requestKey: 'blueprint:learningObjective:atp',
        sourceProgramCode: 'ATP',
        candidates: ['tujuan_pembelajaran'],
    },
    {
        requestKey: 'blueprint:learningObjective:prota',
        sourceProgramCode: 'PROTA',
        candidates: ['tujuan_pembelajaran'],
    },
    {
        requestKey: 'blueprint:materialScope:atp',
        sourceProgramCode: 'ATP',
        candidates: ['materi_pokok', 'konten_materi'],
    },
    {
        requestKey: 'blueprint:materialScope:cp',
        sourceProgramCode: 'CP',
        candidates: ['konten_materi', 'materi_pokok'],
    },
    {
        requestKey: 'blueprint:indicator:kktp',
        sourceProgramCode: 'KKTP',
        candidates: ['indikator_ketercapaian', 'indikator_ketercapaian_tp', 'iktp', 'indikator'],
    },
];

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

function normalizeReviewFeedback(raw: unknown): QuestionReviewFeedback | undefined {
    const source = raw && typeof raw === 'object' ? (raw as QuestionReviewFeedback) : undefined;
    if (!source) return undefined;
    const normalized: QuestionReviewFeedback = {
        questionComment: String(source.questionComment || '').trim(),
        blueprintComment: String(source.blueprintComment || '').trim(),
        questionCardComment: String(source.questionCardComment || '').trim(),
        teacherResponse: String(source.teacherResponse || '').trim(),
        reviewedAt: String(source.reviewedAt || '').trim(),
        teacherRespondedAt: String(source.teacherRespondedAt || '').trim(),
        reviewer: source.reviewer?.name
            ? {
                id: source.reviewer.id,
                name: source.reviewer.name,
            }
            : undefined,
        teacherResponder: source.teacherResponder?.name
            ? {
                id: source.teacherResponder.id,
                name: source.teacherResponder.name,
            }
            : undefined,
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

function sanitizeQuestionHtml(value: string | undefined | null): string {
    return String(value || '')
        .replace(/<hr\b[^>]*>/gi, '')
        .trim();
}

function hasInlineMediaData(value: unknown): boolean {
    return typeof value === 'string' && /data:(image|video)\//i.test(value);
}

function sanitizeQuestionForSubmit(
    question: ExtendedQuestion,
    index: number,
    supportsQuestionSupport: boolean,
): Record<string, unknown> {
    const sanitizedContent = sanitizeQuestionHtml(question.content);
    if (hasInlineMediaData(sanitizedContent) || hasInlineMediaData(question.question_image_url) || hasInlineMediaData(question.question_video_url)) {
        throw new Error(
            `Soal nomor ${index + 1} memuat media inline yang terlalu besar. Upload gambar/video lewat tombol upload yang tersedia.`,
        );
    }

    const payload: Record<string, unknown> = {
        id: String(question.id || `q-${index + 1}`),
        type: question.type,
        content: sanitizedContent,
        score: normalizePositiveScore(question.score),
        question_image_url: question.question_image_url || undefined,
        question_video_url: question.question_video_url || undefined,
        question_video_type: question.question_video_type || undefined,
        question_media_position: question.question_media_position || undefined,
    };

    if (question.type === 'MATRIX_SINGLE_CHOICE') {
        const matrixPromptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
        const matrixColumns = normalizeMatrixColumns(question.matrixColumns);
        const matrixRows = normalizeMatrixRows(question.matrixRows, matrixPromptColumns, matrixColumns).map((row) => {
            if (hasInlineMediaData(row.content)) {
                throw new Error(
                    `Baris grid pada soal nomor ${index + 1} memuat media inline yang terlalu besar. Gunakan teks biasa atau upload media pada area soal utama.`,
                );
            }
            return {
                id: row.id,
                content: row.content,
                cells: Array.isArray(row.cells)
                    ? row.cells.map((cell) => {
                        if (hasInlineMediaData(cell.content)) {
                            throw new Error(
                                `Kolom data pada soal nomor ${index + 1} memuat media inline yang terlalu besar.`,
                            );
                        }
                        return {
                            columnId: cell.columnId,
                            content: cell.content,
                        };
                    })
                    : [],
                correctOptionId: row.correctOptionId,
            };
        });

        payload.matrixPromptColumns = matrixPromptColumns.map((column) => ({
            id: column.id,
            label: column.label,
        }));
        payload.matrixColumns = matrixColumns.map((column) => ({
            id: column.id,
            content: column.content,
        }));
        payload.matrixRows = matrixRows;
    } else if (question.type !== 'ESSAY') {
        payload.options = Array.isArray(question.options)
            ? question.options.map((option, optionIndex) => {
                const normalizedOptionContent = sanitizeQuestionHtml(option.content);
                if (hasInlineMediaData(normalizedOptionContent) || hasInlineMediaData(option.image_url)) {
                    throw new Error(
                        `Opsi jawaban pada soal nomor ${index + 1} memuat media inline yang terlalu besar. Upload gambar opsi lewat tombol upload gambar opsi.`,
                    );
                }
                return {
                    id: String(option.id || `${question.id || `q-${index + 1}`}-opt-${optionIndex + 1}`),
                    content: normalizedOptionContent,
                    isCorrect: Boolean(option.isCorrect),
                    image_url: option.image_url || undefined,
                };
            })
            : [];
    }

    if (supportsQuestionSupport) {
        payload.blueprint = normalizeBlueprint(question.blueprint);
        payload.questionCard = buildDerivedQuestionCard(question);
    }

    return payload;
}

function normalizePositiveScore(value: unknown, fallback = 1): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function normalizeImportedBankScore(
    pointsValue: unknown,
    scoreValue: unknown,
): { score: number; normalizedFromLegacy: boolean } {
    // For bank questions, "points" is the source of truth.
    const rawPoints = Number(pointsValue);
    if (Number.isFinite(rawPoints) && rawPoints > 0) {
        // Legacy bank data may still store percentage-like values (50-100).
        if (rawPoints >= 50) {
            return { score: 1, normalizedFromLegacy: true };
        }
        return { score: rawPoints, normalizedFromLegacy: false };
    }

    const rawScore = Number(scoreValue);
    if (Number.isFinite(rawScore) && rawScore > 0) {
        return { score: rawScore, normalizedFromLegacy: false };
    }

    return { score: 1, normalizedFromLegacy: false };
}

function isLikelyVideoUrl(url: string): boolean {
    const normalized = String(url || '').trim().toLowerCase();
    if (!normalized) return false;
    if (
        normalized.includes('youtube.com') ||
        normalized.includes('youtu.be') ||
        normalized.includes('vimeo.com')
    ) {
        return true;
    }
    return /\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|#|$)/i.test(normalized);
}

function normalizeOfficePasteText(value: string): string {
    const normalized = String(value || '')
        .replace(/\r\n?/g, '\n')
        // Beberapa paste dari Word datang sebagai literal escaped text.
        .replace(/\\r\\n|\\n\\r|\\n|\\r/g, '\n')
        .replace(/\\t/g, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/\uFFFD/g, '')
        // Object replacement char dari Word/OLE (muncul seperti kotak besar).
        .replace(/\uFFFC/g, '')
        // Hilangkan karakter placeholder kotak dari paste rumus Word.
        .replace(/[\u2591-\u2593\u25A0-\u25A1\u25AA-\u25AB\u25AD-\u25AE\u25FB-\u25FE\u2B1B-\u2B1C]/g, '')
        // Private-use chars dari Symbol/Equation Word yang sering tampil kotak di web.
        .replace(/[\uE000-\uF8FF]/g, '')
        // Delimiter khas Word Equation.
        .replace(/〖/g, '(')
        .replace(/〗/g, ')')
        .replace(/¦/g, '|')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\[/g, '[')
        .replace(/\\\]/g, ']')
        .replace(/\\_/g, '_')
        .replace(/[□■▪▫◻◼◽◾⌷⌸⟦⟧⧼⧽]/g, '')
        .replace(/[﹛﹜【】〔〕]/g, '')
        .replace(/[∟⟂⟨⟩]/g, ' ')
        .replace(/㠰/g, 'n')
        .replace(/⎛|⎜|⎝/g, '(')
        .replace(/⎞|⎟|⎠/g, ')')
        .replace(/⎡|⎢|⎣/g, '[')
        .replace(/⎤|⎥|⎦/g, ']')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\u2061/g, '')
        .replace(/\t{2,}/g, '\t')
        .replace(/[ \t]*_[ \t]*\(([^)]+)\)/g, '_{$1}')
        .replace(/[ \t]*\^[ \t]*\(([^)]+)\)/g, '^{$1}')
        .replace(/^\s*\n/, '')
        // Normalisasi notasi sigma/pi linear khas Word agar lebih terbaca.
        .replace(/Σ_\(([^)]+)\)\^([^\s]+)/g, '∑_{$1}^{$2}')
        .replace(/Π_\(([^)]+)\)\^([^\s]+)/g, '∏_{$1}^{$2}')
        .replace(/∫_\(([^)]+)\)\^([^\s]+)/g, '∫_{$1}^{$2}')
        // Normalisasi notasi kombinasi (n|k) dari Word Equation.
        .replace(/\(([^()|]+)\|([^()|]+)\)/g, (_full, left: string, right: string) => {
            const l = String(left || '').trim();
            const r = String(right || '').trim();
            if (!l || !r) return _full;
            return `(${l} choose ${r})`;
        })
        .replace(/[ \t\f\v]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return normalized;
}

function extractPlainTextFromHtml(html: string): string {
    if (typeof window === 'undefined') {
        return normalizeOfficePasteText(String(html || '').replace(/<[^>]*>/g, ' '));
    }

    const parser = new window.DOMParser();
    const doc = parser.parseFromString(String(html || ''), 'text/html');

    doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,h5,h6').forEach((node) => node.append('\n'));

    return normalizeOfficePasteText(doc.body.textContent || '');
}

function shouldNormalizeOfficePaste(html: string): boolean {
    return /mso-|class=(['"])[^'"]*\bMso|xmlns:o|<o:p|<\/?(table|tr|td|th)\b|<math\b|<m:|<img\b|Equation\.DSMT|urn:schemas-microsoft-com|application\/vnd\.openxmlformats-officedocument|cambria\s+math|equationeditor|office:word|worddocument/i.test(
        String(html || ''),
    );
}

function shouldNormalizeOfficePlainText(text: string): boolean {
    const raw = String(text || '');
    if (!raw) return false;
    return /[\uE000-\uF8FF\uFFFC\u2591-\u2593\u25A0-\u25A1\u25AA-\u25AB]|&nbsp;|\\n|〖|〗|¦|Σ_\(|Π_\(|∫_\(|\([^()|]+\|[^()|]+\)|\^\(|\bchoose\b/.test(
        raw,
    );
}

function clipboardHasRtfPayload(clipboard: DataTransfer | null): boolean {
    if (!clipboard) return false;
    const rawTypes =
        typeof clipboard.types?.forEach === 'function'
            ? Array.from(clipboard.types)
            : [];
    return rawTypes.some((type) => /rtf|richtext|msword|openxml/i.test(String(type || '')));
}

function resolveOfficeClipboardText(rawText: string, html: string): string {
    const normalizedHtmlText = html ? extractPlainTextFromHtml(html) : '';
    const normalizedRawText = normalizeOfficePasteText(rawText || '');
    if (!normalizedHtmlText) return normalizedRawText;
    if (!normalizedRawText) return normalizedHtmlText;

    const rawHasPlaceholderGlyph = /[\uFFFD\uFFFC\uE000-\uF8FF\u2591-\u2593\u25A0-\u25A1\u25AA-\u25AB]/.test(
        rawText || '',
    );
    if (rawHasPlaceholderGlyph) {
        return normalizedHtmlText.length >= normalizedRawText.length ? normalizedHtmlText : normalizedRawText;
    }

    const mathLikePattern =
        /(Σ|Π|∫|√|∞|≈|≠|≤|≥|choose|[A-Za-z0-9]+\s*\^\s*[A-Za-z0-9({[]|_\{|[+\-*/=<>])/;
    const htmlLooksDegraded =
        normalizedHtmlText.length < normalizedRawText.length * 0.65 ||
        /(?:^|[\s(])(?:n|k|a|x)\s+n(?:[\s)}]|$)|\b[a-z]\s+\^\s+[a-z]\b/i.test(normalizedHtmlText);

    if (mathLikePattern.test(normalizedRawText) && htmlLooksDegraded) {
        return normalizedRawText;
    }

    return normalizedHtmlText;
}

// Quill modules configuration
if (typeof window !== 'undefined') {
  (window as Window & { katex?: typeof katex }).katex = katex;
}

const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'script': 'sub'}, { 'script': 'super' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }, { 'direction': 'rtl' }],
    [{ 'color': [] }, { 'background': [] }],
    ['link', 'formula'],
    ['clean']
  ],
  history: {
    delay: 350,
    maxStack: 100,
    userOnly: true,
  },
  keyboard: {
    bindings: {
      shiftEnter: {
        key: 'Enter',
        shiftKey: true,
        handler(this: { quill: { insertText: (index: number, text: string, source: string) => void; setSelection: (index: number, length: number, source: string) => void } }, range: { index: number }) {
          this.quill.insertText(range.index, '\n', 'user');
          this.quill.setSelection(range.index + 1, 0, 'silent');
          return false;
        },
      },
      altEnter: {
        key: 'Enter',
        altKey: true,
        handler(this: { quill: { insertText: (index: number, text: string, source: string) => void; setSelection: (index: number, length: number, source: string) => void } }, range: { index: number }) {
          this.quill.insertText(range.index, '\n', 'user');
          this.quill.setSelection(range.index + 1, 0, 'silent');
          return false;
        },
      },
    },
  },
};

interface PacketForm {
  title: string;
  description: string;
  type: ExamType;
  programCode: string;
  teacherAssignmentId?: number | null;
  duration: number;
  publishedQuestionCount?: number | null;
  kkm?: number;
  subjectId?: number | null;
  academicYearId: number;
  semester: string;
  saveToBank: boolean;
  instructions: string;
  questions: ExtendedQuestion[];
}

type ExamEditorDraftShape = {
    form?: Partial<PacketForm>;
    questions?: unknown;
};

type ExamEditorDraftEnvelope = {
    updatedAt: string;
    draft: ExamEditorDraftShape;
};

const EXAM_EDITOR_DRAFT_STORAGE_PREFIX = 'sis:teacher:exam-editor:draft:';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getLocalExamDraftStorageKey(userId: number): string {
    return `${EXAM_EDITOR_DRAFT_STORAGE_PREFIX}${userId}`;
}

function readLocalExamDraft(userId: number): unknown {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(getLocalExamDraftStorageKey(userId));
        if (!raw) return null;
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function writeLocalExamDraft(userId: number, draft: ExamEditorDraftShape) {
    if (typeof window === 'undefined') return;
    try {
        const envelope: ExamEditorDraftEnvelope = {
            updatedAt: new Date().toISOString(),
            draft,
        };
        window.localStorage.setItem(getLocalExamDraftStorageKey(userId), JSON.stringify(envelope));
    } catch {
        // Ignore local storage write failures.
    }
}

function clearLocalExamDraft(userId: number) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(getLocalExamDraftStorageKey(userId));
    } catch {
        // Ignore local storage clear failures.
    }
}

function extractExamDraftPayload(raw: unknown): {
    draft: ExamEditorDraftShape | null;
    updatedAtMs: number;
} {
    const parseDate = (value: unknown) => {
        const ts = new Date(String(value || '')).getTime();
        return Number.isFinite(ts) ? ts : 0;
    };

    if (!raw) {
        return { draft: null, updatedAtMs: 0 };
    }

    if (typeof raw === 'string') {
        try {
            return extractExamDraftPayload(JSON.parse(raw) as unknown);
        } catch {
            return { draft: null, updatedAtMs: 0 };
        }
    }

    if (!isRecord(raw)) {
        return { draft: null, updatedAtMs: 0 };
    }

    if (isRecord(raw.draft)) {
        return {
            draft: raw.draft as ExamEditorDraftShape,
            updatedAtMs: parseDate(raw.updatedAt),
        };
    }

    if ('form' in raw || 'questions' in raw) {
        return {
            draft: raw as ExamEditorDraftShape,
            updatedAtMs: parseDate(raw.updatedAt),
        };
    }

    return { draft: null, updatedAtMs: 0 };
}

function stripExamQuestionHtml(value: string | undefined | null): string {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p>/gi, '\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/(p|div|ul|ol|table|tr|section|article|blockquote)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function getQuestionOptionLabel(index: number): string {
    return String.fromCharCode(65 + Math.max(0, index));
}

function createMatrixPromptColumns(): QuestionMatrixPromptColumn[] {
    return [{ id: Math.random().toString(36).substr(2, 9), label: 'Pernyataan' }];
}

function createMatrixColumns(): QuestionMatrixColumn[] {
    return [
        { id: Math.random().toString(36).substr(2, 9), content: 'Benar' },
        { id: Math.random().toString(36).substr(2, 9), content: 'Salah' },
    ];
}

function createMatrixRowCells(promptColumns: QuestionMatrixPromptColumn[]) {
    return promptColumns.map((column) => ({
        columnId: column.id,
        content: '',
    }));
}

function createMatrixRows(
    promptColumns: QuestionMatrixPromptColumn[],
    columns: QuestionMatrixColumn[],
): QuestionMatrixRow[] {
    const defaultCorrectColumnId = columns[0]?.id;
    return [
        {
            id: Math.random().toString(36).substr(2, 9),
            content: '',
            cells: createMatrixRowCells(promptColumns),
            correctOptionId: defaultCorrectColumnId,
        },
        {
            id: Math.random().toString(36).substr(2, 9),
            content: '',
            cells: createMatrixRowCells(promptColumns),
            correctOptionId: defaultCorrectColumnId,
        },
        {
            id: Math.random().toString(36).substr(2, 9),
            content: '',
            cells: createMatrixRowCells(promptColumns),
            correctOptionId: defaultCorrectColumnId,
        },
    ];
}

function normalizeMatrixPromptColumns(raw: unknown): QuestionMatrixPromptColumn[] {
    if (!Array.isArray(raw)) return [];
    const columns: QuestionMatrixPromptColumn[] = [];
    raw.forEach((item, index) => {
        const source = item && typeof item === 'object' ? (item as QuestionMatrixPromptColumn) : undefined;
        const label = String(source?.label || '').trim();
        if (!label) return;
        columns.push({
            id: String(source?.id || `matrix-prompt-col-${index + 1}`),
            label,
        });
    });
    return columns;
}

function ensureMatrixPromptColumnsForEditor(raw: unknown): QuestionMatrixPromptColumn[] {
    if (!Array.isArray(raw) || raw.length === 0) return createMatrixPromptColumns();
    return raw.map((item, index) => {
        const source = item && typeof item === 'object' ? (item as QuestionMatrixPromptColumn) : undefined;
        return {
            id: String(source?.id || `matrix-prompt-col-${index + 1}`),
            label: String(source?.label || ''),
        };
    });
}

function normalizeMatrixColumns(raw: unknown): QuestionMatrixColumn[] {
    if (!Array.isArray(raw)) return [];
    const columns: QuestionMatrixColumn[] = [];
    raw.forEach((item, index) => {
        const source = item && typeof item === 'object' ? (item as QuestionMatrixColumn) : undefined;
        const content = String(source?.content || '').trim();
        if (!content) return;
        columns.push({
            id: String(source?.id || `matrix-col-${index + 1}`),
            content,
        });
    });
    return columns;
}

function ensureMatrixColumnsForEditor(raw: unknown): QuestionMatrixColumn[] {
    if (!Array.isArray(raw) || raw.length === 0) return createMatrixColumns();
    return raw.map((item, index) => {
        const source = item && typeof item === 'object' ? (item as QuestionMatrixColumn) : undefined;
        return {
            id: String(source?.id || `matrix-col-${index + 1}`),
            content: String(source?.content || ''),
        };
    });
}

function normalizeMatrixRows(
    raw: unknown,
    promptColumns: QuestionMatrixPromptColumn[],
    columns: QuestionMatrixColumn[],
): QuestionMatrixRow[] {
    if (!Array.isArray(raw)) return [];
    const validPromptColumnIds = new Set(promptColumns.map((column) => column.id));
    const validColumnIds = new Set(columns.map((column) => column.id));
    const defaultCorrectColumnId = columns[0]?.id;
    const rows: QuestionMatrixRow[] = [];
    raw.forEach((item, index) => {
        const source = item && typeof item === 'object' ? (item as QuestionMatrixRow) : undefined;
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
                correctOptionId && validColumnIds.has(correctOptionId)
                    ? correctOptionId
                    : defaultCorrectColumnId,
        });
    });
    return rows;
}

function ensureMatrixRowsForEditor(
    raw: unknown,
    promptColumns: QuestionMatrixPromptColumn[],
    columns: QuestionMatrixColumn[],
): QuestionMatrixRow[] {
    if (!Array.isArray(raw) || raw.length === 0) return createMatrixRows(promptColumns, columns);
    const validColumnIds = new Set(columns.map((column) => column.id));
    const defaultCorrectColumnId = columns[0]?.id;

    return raw.map((item, index) => {
        const source = item && typeof item === 'object' ? (item as QuestionMatrixRow) : undefined;
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
    row: QuestionMatrixRow,
    promptColumns: QuestionMatrixPromptColumn[],
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

function buildDerivedQuestionAnswerKey(question: ExtendedQuestion): string {
    if (question.type === 'ESSAY') {
        return 'Jawaban esai diperiksa manual oleh guru.';
    }

    if (question.type === 'MATRIX_SINGLE_CHOICE') {
        const promptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
        const columns = normalizeMatrixColumns(question.matrixColumns);
        const rows = normalizeMatrixRows(question.matrixRows, promptColumns, columns);
        const columnContentById = new Map(columns.map((column) => [column.id, column.content]));
        return rows
            .filter((row) => row.correctOptionId)
            .map((row, index) => {
                const columnLabel = columnContentById.get(String(row.correctOptionId || '').trim()) || '-';
                return `${index + 1}. ${buildMatrixRowDisplayText(row, promptColumns)} -> ${columnLabel}`;
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
            const parts = [`${label}. ${stripExamQuestionHtml(option.content) || 'Opsi benar tanpa teks'}`];
            if (option.image_url) {
                parts.push(`Media opsi ${label}: ${option.image_url}`);
            }
            return parts.join('\n');
        })
        .join('\n\n')
        .trim();
}

function buildDerivedQuestionStimulus(question: ExtendedQuestion): string {
    const sections: string[] = [];
    const questionText = stripExamQuestionHtml(question.content);
    if (questionText) {
        sections.push(questionText);
    }
    if (question.question_image_url) {
        sections.push(`Media soal: ${question.question_image_url}`);
    }
    if (question.question_video_url) {
        sections.push(`Video soal: ${question.question_video_url}`);
    }

    if (question.type === 'MATRIX_SINGLE_CHOICE') {
        const promptColumns = normalizeMatrixPromptColumns(question.matrixPromptColumns);
        const columns = normalizeMatrixColumns(question.matrixColumns);
        const rows = normalizeMatrixRows(question.matrixRows, promptColumns, columns);
        if (columns.length > 0) {
            sections.push(
                ['Pilihan jawaban:', ...columns.map((column, index) => `${index + 1}. ${column.content}`)].join('\n'),
            );
        }
        if (promptColumns.length > 0) {
            sections.push(
                ['Kolom data:', ...promptColumns.map((column, index) => `${index + 1}. ${column.label}`)].join('\n'),
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
                const parts = [`${label}. ${stripExamQuestionHtml(option.content) || 'Opsi tanpa teks'}`];
                if (option.image_url) {
                    parts.push(`Media opsi ${label}: ${option.image_url}`);
                }
                return parts.join('\n');
            })
            .filter(Boolean);

        if (optionLines.length > 0) {
            sections.push(optionLines.join('\n'));
        }
    }

    return sections.join('\n\n').trim();
}

function buildDerivedQuestionCard(question: ExtendedQuestion): QuestionCard {
    const blueprint = normalizeBlueprint(question.blueprint);
    return {
        stimulus: buildDerivedQuestionStimulus(question),
        answerRationale: String(blueprint.indicator || '').trim(),
        scoringGuideline: buildDerivedQuestionAnswerKey(question),
        distractorNotes: String(blueprint.cognitiveLevel || '').trim(),
    };
}

function assertFixedSemesterMatch(fixedSemester: 'ODD' | 'EVEN' | null | undefined, semester: string) {
  if (fixedSemester && semester !== fixedSemester) {
    throw new Error(
      `Program ini hanya boleh semester ${fixedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.`,
    );
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

function resolveProgramPacketType(program?: ExamProgram | null, fallback: ExamType = 'FORMATIF'): ExamType {
  const baseType = normalizeExamProgramCode(program?.baseType || program?.baseTypeCode);
  if (baseType) return baseType as ExamType;
  const componentType = normalizeExamProgramCode(program?.gradeComponentTypeCode || program?.gradeComponentType);
  if (componentType === 'FORMATIVE') return 'FORMATIF';
  return fallback;
}

function normalizeClassLevelToken(raw?: string | null): string {
    const value = String(raw || '').trim().toUpperCase();
    if (!value) return '';
    if (value.startsWith('XII')) return 'XII';
    if (value.startsWith('XI')) return 'XI';
    if (value.startsWith('X')) return 'X';
    return value;
}

function splitReferenceLines(value: unknown): string[] {
    return String(value || '')
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter((line) => Boolean(line && !['-', '—', '–'].includes(line)));
}

function getSnapshotValue(snapshot: Record<string, string> | undefined, candidates: string[]): string {
    if (!snapshot) return '';
    const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase());
    const entries = Object.entries(snapshot);
    for (const [key, value] of entries) {
        const normalizedKey = key.toLowerCase();
        if (normalizedCandidates.includes(normalizedKey)) {
            return String(value || '').trim();
        }
    }
    return '';
}

function expandBlueprintReferenceOption(option: TeachingResourceProjectedReferenceOption): BlueprintReferenceOption[] {
    const lines = splitReferenceLines(option.value);
    if (lines.length <= 1) {
        return [
            {
                ...option,
                value: String(option.value || '').trim(),
                label: String(option.value || option.label || '').trim(),
                optionKey: `${option.requestKey}::${option.selectValue}`,
            },
        ];
    }

    return lines.map((line, index) => {
        const lineSnapshot = Object.entries(option.snapshot || {}).reduce<Record<string, string>>((acc, [key, rawValue]) => {
            const valueLines = splitReferenceLines(rawValue);
            acc[key] = valueLines.length === lines.length ? valueLines[index] || '' : String(rawValue || '').trim();
            return acc;
        }, {});
        return {
            ...option,
            value: line,
            label: line,
            snapshot: lineSnapshot,
            isAggregate: false,
            lineCount: 1,
            optionKey: `${option.requestKey}::${option.selectValue}::line-${index}`,
        };
    });
}

function buildReferenceOptionText(option: BlueprintReferenceOption): string {
    const source = String(option.sourceProgramCode || '').trim();
    const value = String(option.value || option.label || '').trim();
    return source ? `${value} (${source})` : value;
}

function isUmbrellaTeachingResourceSubjectLabel(raw?: string | null): boolean {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return false;
    return (
        value.includes('konsentrasi keahlian') ||
        value.includes('kompetensi keahlian') ||
        value.includes('program keahlian')
    );
}

function buildAssignmentDisplayLabel(assignment: TeacherAssignment): string {
    const subjectName = String(assignment.subject?.name || '-').trim();
    const className = String(assignment.class?.name || '-').trim();
    const teacherName = String(assignment.teacher?.name || '-').trim();
    return `${subjectName} — ${className} — ${teacherName}`;
}

export const ExamEditorPage = () => {
    const { id } = useParams();
    const location = useLocation();
    const requestedQuestionId = useMemo(
        () => String(new URLSearchParams(location.search).get('questionId') || '').trim(),
        [location.search],
    );
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const isEditMode = !!id;

    // Ref to track submission status to prevent draft saving during submit
    const isSubmittingRef = React.useRef(false);
    // Ref to track if draft has been loaded to prevent double question initialization
    const draftLoadedRef = React.useRef(false);
    const draftPromptShownRef = React.useRef(false);
    // Ref for autosave debounce
    const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const localSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestDraftRef = React.useRef<{ form: Partial<PacketForm>; questions: ExtendedQuestion[] }>({
        form: {},
        questions: [],
    });
    const currentPreferencesRef = React.useRef<Record<string, unknown>>({});
    const quillEditorRef = useRef<ReactQuill | null>(null);

    const [loading, setLoading] = useState(false);
    const [subjects, setSubjects] = useState<{id: number, name: string, kkm?: number}[]>([]);
    const [assignmentOptions, setAssignmentOptions] = useState<TeacherAssignment[]>([]);
    const [activeAcademicYear, setActiveAcademicYear] = useState<{id: number, name: string} | null>(null);
    const [loadedPacket, setLoadedPacket] = useState<ExamPacket | null>(null);
    
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

    useEffect(() => {
        currentPreferencesRef.current = ((userData?.data?.preferences ?? {}) as Record<string, unknown>);
    }, [userData?.data?.preferences]);

    const syncCachedPreferences = React.useCallback((preferences: Record<string, unknown>) => {
        currentPreferencesRef.current = preferences;
        if (!userId) return;
        queryClient.setQueryData(['user-profile', userId], (previous: unknown) => {
            const prevRecord = isRecord(previous) ? previous : null;
            const prevUser = prevRecord && isRecord(prevRecord.data) ? prevRecord.data : null;
            if (!prevRecord || !prevUser) return previous;
            return {
                ...prevRecord,
                data: {
                    ...prevUser,
                    preferences,
                },
            };
        });
    }, [queryClient, userId]);

    const updateProfileMutation = useMutation({
      mutationFn: (data: Partial<UserWrite>) => {
        if (!userId) throw new Error('User ID not found');
        return userService.update(userId, data);
      },
      onMutate: async (data) => {
         if (data.preferences && isRecord(data.preferences)) {
            syncCachedPreferences(data.preferences as Record<string, unknown>);
         }
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
    const [isQuestionSupportModalOpen, setIsQuestionSupportModalOpen] = useState(false);
    const [isStudentPreviewOpen, setIsStudentPreviewOpen] = useState(false);
    const [questionPendingDeleteId, setQuestionPendingDeleteId] = useState<string | null>(null);
    const [draftRestorePrompt, setDraftRestorePrompt] = useState<{
        draftRaw: unknown;
        preferences: Record<string, unknown>;
        source: 'profile' | 'local';
    } | null>(null);

    const routeState = (location.state as {
        type?: ExamType;
        programCode?: string;
        programLabel?: string;
        fixedSemester?: 'ODD' | 'EVEN' | null;
        packetDraft?: {
            title?: string;
            teacherAssignmentId?: number;
            subjectId?: number;
            semester?: 'ODD' | 'EVEN';
            duration?: number;
            instructions?: string;
        };
    } | null) || null;
    const presetType = routeState?.type;
    const presetProgramCode = normalizeExamProgramCode(routeState?.programCode || routeState?.type);
    const presetProgramLabel = routeState?.programLabel || '';
    const presetFixedSemester = routeState?.fixedSemester || null;
    const presetPacketDraft = routeState?.packetDraft || null;

    // UI State for Editor
    const [section, setSection] = useState<'OBJECTIVE' | 'ESSAY'>('OBJECTIVE');
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [reviewReplyDraft, setReviewReplyDraft] = useState('');
    const [reviewReplySubmitting, setReviewReplySubmitting] = useState(false);
    const [expandedReviewNotes, setExpandedReviewNotes] = useState<Record<string, boolean>>({});
    const optionTextHistoryRef = useRef<Record<string, TextFieldHistoryState>>({});
    const [, setOptionHistoryVersion] = useState(0);
    
    // Media Upload State
    // Removed mediaTarget state as we use direct targetId passing

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<PacketForm>({
        defaultValues: {
            title: presetPacketDraft?.title || '',
            type: presetType || '',
            programCode: presetProgramCode || '',
            teacherAssignmentId: presetPacketDraft?.teacherAssignmentId,
            duration: presetPacketDraft?.duration || undefined,
            publishedQuestionCount: undefined,
            kkm: undefined,
            saveToBank: true,
            semester: presetFixedSemester || presetPacketDraft?.semester || 'ODD',
            subjectId: presetPacketDraft?.subjectId,
            instructions: presetPacketDraft?.instructions || '',
            questions: []
        }
    });

    // Auto-Draft Logic using User Preferences (Database)
    const formValues = watch();
    useEffect(() => {
        latestDraftRef.current = {
            form: formValues,
            questions,
        };
    }, [formValues, questions]);
    const watchedPacketType = (watch('type') || presetType || '') as ExamType;
    const selectedPacketSemester = watch('semester') || 'ODD';
    const selectedProgramCodeRaw = watch('programCode') || presetProgramCode;
    const selectedProgramCode = normalizeExamProgramCode(selectedProgramCodeRaw);
    const selectedAcademicYearId = Number(watch('academicYearId') || activeAcademicYear?.id || 0);
    const selectedSubjectId = Number(watch('subjectId') || 0);
    const selectedTeacherAssignmentId = Number(watch('teacherAssignmentId') || 0);

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

    useEffect(() => {
        if (!selectedProgramCode) return;
        sessionStorage.setItem('teacher:last_exam_program_slug', examProgramCodeToSlug(selectedProgramCode));
    }, [selectedProgramCode]);
    const allowedSubjectIdsByProgram = useMemo(() => {
        const ids = Array.isArray(selectedProgramMeta?.allowedSubjectIds) ? selectedProgramMeta?.allowedSubjectIds : [];
        return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0));
    }, [selectedProgramMeta?.allowedSubjectIds]);
    const allowedClassLevelsByProgram = useMemo(() => {
        const levels = Array.isArray(selectedProgramMeta?.targetClassLevels) ? selectedProgramMeta?.targetClassLevels : [];
        return new Set(
            levels
                .map((level) => normalizeClassLevelToken(level))
                .filter((level) => Boolean(level)),
        );
    }, [selectedProgramMeta?.targetClassLevels]);
    const filteredAssignmentsByProgram = useMemo(() => {
        if (!selectedProgramMeta) return assignmentOptions;
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
    }, [selectedProgramMeta, assignmentOptions, allowedSubjectIdsByProgram, allowedClassLevelsByProgram]);
    const resolvedPacketType = resolveProgramPacketType(
        selectedProgramMeta,
        (watchedPacketType || presetType || 'FORMATIF') as ExamType,
    );
    const resolvedFixedSemester = selectedProgramMeta?.fixedSemester || presetFixedSemester || null;
    const isSemesterLockedFromProgram = !isEditMode && Boolean(resolvedFixedSemester);
    const scoreSyncCopy = getScoreSyncCopy(selectedProgramMeta);
    const examTypeDisplayLabel =
        selectedProgramMeta?.label ||
        presetProgramLabel ||
        selectedProgramMeta?.shortLabel ||
        selectedProgramCode ||
        resolvedPacketType;
    const isCurriculumManagedPacket = Boolean(loadedPacket?.isCurriculumManaged);
    const supportsQuestionSupport = isCurriculumManagedPacket;
    const curriculumScheduledClassNames = useMemo(() => {
        const classNames = (loadedPacket?.schedules || [])
            .map((schedule) => String(schedule.class?.name || '').trim())
            .filter((name) => Boolean(name));
        return Array.from(new Set(classNames));
    }, [loadedPacket?.schedules]);
    const selectedAssignmentForReferences = useMemo(() => {
        const selected = assignmentOptions.find((assignment) => assignment.id === selectedTeacherAssignmentId);
        if (selected) return selected;

        const scheduledClassNameSet = new Set(curriculumScheduledClassNames.map((name) => name.toLowerCase()));
        const sameSubjectAssignments = assignmentOptions.filter(
            (assignment) => Number(assignment.subject?.id || 0) === selectedSubjectId,
        );
        if (scheduledClassNameSet.size > 0) {
            const byScheduledClass = sameSubjectAssignments.find((assignment) =>
                scheduledClassNameSet.has(String(assignment.class?.name || '').trim().toLowerCase()),
            );
            if (byScheduledClass) return byScheduledClass;
        }

        return sameSubjectAssignments[0] || null;
    }, [assignmentOptions, curriculumScheduledClassNames, selectedSubjectId, selectedTeacherAssignmentId]);
    const selectedSubjectForReferences = useMemo(
        () => subjects.find((subject) => Number(subject.id) === selectedSubjectId) || null,
        [selectedSubjectId, subjects],
    );

    const teachingResourceReferenceContext = useMemo(() => {
        const classNameHint = curriculumScheduledClassNames[0] || '';
        const classLevel =
            normalizeClassLevelToken(selectedAssignmentForReferences?.class?.level) ||
            normalizeClassLevelToken(selectedAssignmentForReferences?.class?.name) ||
            normalizeClassLevelToken(classNameHint);
        return {
            subjectId: selectedSubjectId || undefined,
            classLevel: classLevel || undefined,
            programKeahlian: String(selectedAssignmentForReferences?.class?.major?.name || '').trim() || undefined,
            semester: selectedPacketSemester === 'EVEN' ? 'Genap' : 'Ganjil',
        };
    }, [curriculumScheduledClassNames, selectedAssignmentForReferences, selectedPacketSemester, selectedSubjectId]);
    const teachingResourceReferenceSubjectIds = useMemo(() => {
        const ids = new Set<number>();
        if (selectedSubjectId > 0) ids.add(selectedSubjectId);

        const shouldIncludeSpecificAssignmentSubjects = isUmbrellaTeachingResourceSubjectLabel(
            selectedSubjectForReferences?.name ||
            selectedAssignmentForReferences?.subject?.name ||
            '',
        );
        if (!shouldIncludeSpecificAssignmentSubjects) return Array.from(ids);

        const scheduledClassNameSet = new Set(curriculumScheduledClassNames.map((name) => name.toLowerCase()));
        const targetLevel = normalizeClassLevelToken(
            selectedAssignmentForReferences?.class?.level ||
            selectedAssignmentForReferences?.class?.name ||
            curriculumScheduledClassNames[0] ||
            '',
        );
        const targetMajor = String(selectedAssignmentForReferences?.class?.major?.name || '').trim().toLowerCase();

        assignmentOptions.forEach((assignment) => {
            const subjectId = Number(assignment.subject?.id || 0);
            if (subjectId <= 0) return;
            const assignmentClassName = String(assignment.class?.name || '').trim().toLowerCase();
            const classMatches =
                scheduledClassNameSet.size === 0 ||
                scheduledClassNameSet.has(assignmentClassName);
            if (!classMatches) return;
            const assignmentLevel = normalizeClassLevelToken(assignment.class?.level || assignment.class?.name);
            if (targetLevel && assignmentLevel && assignmentLevel !== targetLevel) return;
            const assignmentMajor = String(assignment.class?.major?.name || '').trim().toLowerCase();
            if (targetMajor && assignmentMajor && assignmentMajor !== targetMajor) return;
            ids.add(subjectId);
        });

        return Array.from(ids);
    }, [
        assignmentOptions,
        curriculumScheduledClassNames,
        selectedAssignmentForReferences,
        selectedSubjectForReferences?.name,
        selectedSubjectId,
    ]);

    const teachingResourceReferenceRequests = useMemo<TeachingResourceReferenceProjectionRequest[]>(() => {
        if (teachingResourceReferenceSubjectIds.length === 0) return [];
        return teachingResourceReferenceSubjectIds.flatMap((subjectId) =>
            BLUEPRINT_REFERENCE_REQUEST_CONFIGS.map((request) => ({
                ...request,
                requestKey: `${request.requestKey}:subject-${subjectId}`,
                matchBySubject: true,
                matchByClassLevel: Boolean(teachingResourceReferenceContext.classLevel),
                matchByMajor: Boolean(teachingResourceReferenceContext.programKeahlian),
                matchByActiveSemester: false,
                context: {
                    ...teachingResourceReferenceContext,
                    subjectId,
                },
            })),
        );
    }, [teachingResourceReferenceSubjectIds, teachingResourceReferenceContext]);

    const teachingResourceReferencesQuery = useQuery({
        queryKey: [
            'exam-blueprint-teaching-resource-references',
            selectedAcademicYearId,
            teachingResourceReferenceSubjectIds.join(','),
            teachingResourceReferenceContext.classLevel || '',
            teachingResourceReferenceContext.programKeahlian || '',
            selectedPacketSemester,
        ],
        enabled:
            supportsQuestionSupport &&
            selectedAcademicYearId > 0 &&
            teachingResourceReferenceSubjectIds.length > 0 &&
            teachingResourceReferenceRequests.length > 0,
        staleTime: 2 * 60 * 1000,
        queryFn: () =>
            teachingResourceProgramService.getReferenceEntries({
                academicYearId: selectedAcademicYearId,
                programCodes: BLUEPRINT_REFERENCE_PROGRAM_CODES,
                limitPerProgram: 200,
                includeRows: false,
                referenceRequests: teachingResourceReferenceRequests,
            }),
    });

    const blueprintReferenceOptionsByField = useMemo<Record<BlueprintReferenceField, BlueprintReferenceOption[]>>(() => {
        const empty: Record<BlueprintReferenceField, BlueprintReferenceOption[]> = {
            competency: [],
            learningObjective: [],
            indicator: [],
            materialScope: [],
        };
        const pushedKeys = new Set<string>();
        const pushOption = (field: BlueprintReferenceField, option: BlueprintReferenceOption) => {
            const value = String(option.value || '').trim();
            if (!value) return;
            const dedupeKey = `${field}::${option.sourceProgramCode}::${value}`.toLowerCase();
            if (pushedKeys.has(dedupeKey)) return;
            pushedKeys.add(dedupeKey);
            empty[field].push(option);
        };

        const programs = teachingResourceReferencesQuery.data?.data?.programs || [];
        programs.forEach((program) => {
            (program.options || []).forEach((rawOption) => {
                expandBlueprintReferenceOption(rawOption).forEach((option) => {
                    if (option.requestKey.includes(':competency:')) pushOption('competency', option);
                    if (option.requestKey.includes(':learningObjective:')) pushOption('learningObjective', option);
                    if (option.requestKey.includes(':materialScope:')) pushOption('materialScope', option);
                    if (option.requestKey.includes(':indicator:')) pushOption('indicator', option);
                });
            });
        });

        return empty;
    }, [teachingResourceReferencesQuery.data?.data?.programs]);
    useEffect(() => {
        if (filteredAssignmentsByProgram.length === 0) {
            if (selectedTeacherAssignmentId > 0) {
                setValue('teacherAssignmentId', null, { shouldDirty: true });
            }
            if (selectedSubjectId > 0) {
                setValue('subjectId', null, { shouldDirty: true });
            }
            return;
        }

        const selectedAssignment = filteredAssignmentsByProgram.find(
            (assignment) => assignment.id === selectedTeacherAssignmentId,
        );
        if (selectedAssignment) {
            const assignmentSubjectId = Number(selectedAssignment.subject?.id || 0);
            if (assignmentSubjectId > 0 && assignmentSubjectId !== selectedSubjectId) {
                setValue('subjectId', assignmentSubjectId, { shouldDirty: true });
            }
            if (selectedSubjectId > 0) {
                return;
            }
        }

        const fallbackAssignment =
            filteredAssignmentsByProgram.find((assignment) => assignment.subject?.id === selectedSubjectId) ||
            filteredAssignmentsByProgram[0];
        if (!fallbackAssignment) return;
        setValue('teacherAssignmentId', fallbackAssignment.id, { shouldDirty: true });
        setValue('subjectId', fallbackAssignment.subject.id, { shouldDirty: true });
        const fallbackKkm = Number(fallbackAssignment.kkm);
        if (Number.isFinite(fallbackKkm) && fallbackKkm > 0) {
            setValue('kkm', fallbackKkm, { shouldDirty: true });
        }
    }, [
        filteredAssignmentsByProgram,
        selectedTeacherAssignmentId,
        selectedSubjectId,
        setValue,
    ]);

    useEffect(() => {
        if (isEditMode) {
            setIsInfoModalOpen(false);
            return;
        }
        setIsInfoModalOpen(!presetPacketDraft);
    }, [isEditMode, presetPacketDraft]);
    
    // Restore draft on mount (only for create mode)
    useEffect(() => {
        if (isEditMode || draftLoadedRef.current || draftPromptShownRef.current || !userId) return;

        const prefs = (userData?.data?.preferences ?? {}) as Record<string, unknown>;
        const profileDraft = extractExamDraftPayload(prefs['exam_draft']);
        const localDraftRaw = readLocalExamDraft(userId);
        const localDraft = extractExamDraftPayload(localDraftRaw);

        const nextDraft =
            localDraft.draft && localDraft.updatedAtMs >= profileDraft.updatedAtMs
                ? { source: 'local' as const, raw: localDraftRaw }
                : profileDraft.draft
                  ? { source: 'profile' as const, raw: prefs['exam_draft'] }
                  : null;

        if (!nextDraft?.raw) return;

        draftPromptShownRef.current = true;
        setDraftRestorePrompt({
            draftRaw: nextDraft.raw,
            preferences: prefs,
            source: nextDraft.source,
        });
    }, [isEditMode, userData, userId]);

    useEffect(() => {
        if (!isEditMode) {
            if (presetType) setValue('type', presetType);
            if (presetProgramCode) {
                setValue('programCode', normalizeExamProgramCode(presetProgramCode));
            }
            if (presetFixedSemester === 'ODD' || presetFixedSemester === 'EVEN') {
                setValue('semester', presetFixedSemester);
            }
            if (presetPacketDraft) {
                if (presetPacketDraft.title) setValue('title', presetPacketDraft.title);
                if (presetPacketDraft.subjectId) setValue('subjectId', presetPacketDraft.subjectId);
                if (presetPacketDraft.duration) setValue('duration', presetPacketDraft.duration);
                if (presetPacketDraft.instructions) setValue('instructions', presetPacketDraft.instructions);
                if (presetPacketDraft.semester === 'ODD' || presetPacketDraft.semester === 'EVEN') {
                    setValue('semester', presetPacketDraft.semester);
                }
            }
        }
    }, [isEditMode, presetType, presetProgramCode, presetFixedSemester, presetPacketDraft, setValue]);

    useEffect(() => {
        if (!selectedProgramMeta && teacherPrograms.length > 0) {
            const fallbackProgramCode = normalizeExamProgramCode(teacherPrograms[0].code);
            if (fallbackProgramCode && selectedProgramCode !== fallbackProgramCode) {
                setValue('programCode', fallbackProgramCode);
                return;
            }
        }

        if (normalizeExamProgramCode(selectedProgramCodeRaw) !== selectedProgramCode) {
            setValue('programCode', selectedProgramCode);
        }

        const syncedType = resolveProgramPacketType(
            selectedProgramMeta,
            (watchedPacketType || 'FORMATIF') as ExamType,
        );
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

    }, [
        selectedProgramCodeRaw,
        selectedProgramCode,
        selectedProgramMeta,
        selectedProgramMeta?.baseType,
        teacherPrograms,
        watchedPacketType,
        selectedPacketSemester,
        resolvedFixedSemester,
        setValue,
    ]);

    // Save draft locally first so data survives logout/session expiry.
    useEffect(() => {
        if (isEditMode || isSubmittingRef.current || !userId) return;

        const hasContent =
            questions.length > 1 ||
            (questions.length === 1 && Boolean(normalizeEditorText(questions[0].content)));
        const hasTitle = formValues.title && formValues.title.trim() !== '';

        if (!hasContent && !hasTitle) {
            clearLocalExamDraft(userId);
            return;
        }

        if (localSaveTimeoutRef.current) {
            clearTimeout(localSaveTimeoutRef.current);
        }

        localSaveTimeoutRef.current = setTimeout(() => {
            writeLocalExamDraft(userId, {
                form: formValues,
                questions,
            });
        }, 800);

        return () => {
            if (localSaveTimeoutRef.current) {
                clearTimeout(localSaveTimeoutRef.current);
            }
        };
    }, [questions, formValues, isEditMode, userId]);

    // Save draft on change (Debounced to profile preferences)
    useEffect(() => {
        if (!isEditMode && !isSubmittingRef.current && userId) {
            const hasContent =
                questions.length > 1 ||
                (questions.length === 1 && Boolean(normalizeEditorText(questions[0].content)));
            const hasTitle = formValues.title && formValues.title.trim() !== '';
            
            if (hasContent || hasTitle) {
                // Clear previous timeout
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                }

                // Set new timeout for 2 seconds debounce
                saveTimeoutRef.current = setTimeout(() => {
                    const draft: ExamEditorDraftEnvelope = {
                        updatedAt: new Date().toISOString(),
                        draft: {
                            form: formValues,
                            questions,
                        },
                    };
                    
                    const currentPrefs = currentPreferencesRef.current || {};
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
    }, [questions, formValues, isEditMode, updateProfileMutation, userId]);

    useEffect(() => {
        if (isEditMode || !userId) return;

        return () => {
            if (isSubmittingRef.current) return;

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (localSaveTimeoutRef.current) {
                clearTimeout(localSaveTimeoutRef.current);
            }

            const latestDraft = latestDraftRef.current;
            const latestQuestions = Array.isArray(latestDraft.questions) ? latestDraft.questions : [];
            const latestForm = latestDraft.form || {};
            const hasContent =
                latestQuestions.length > 1 ||
                (latestQuestions.length === 1 && Boolean(normalizeEditorText(latestQuestions[0]?.content)));
            const hasTitle = Boolean(String(latestForm.title || '').trim());

            if (!hasContent && !hasTitle) return;

            const envelope: ExamEditorDraftEnvelope = {
                updatedAt: new Date().toISOString(),
                draft: {
                    form: latestForm,
                    questions: latestQuestions,
                },
            };

            writeLocalExamDraft(userId, envelope.draft);

            const nextPreferences = {
                ...currentPreferencesRef.current,
                exam_draft: envelope,
            };
            syncCachedPreferences(nextPreferences);
            void userService.update(userId, {
                preferences: nextPreferences,
            }).catch((error) => {
                console.error('Failed to flush exam draft on leave:', error);
            });
        };
    }, [isEditMode, syncCachedPreferences, userId]);
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

    // Effect to update KKM when assignment changes
    useEffect(() => {
        if (selectedTeacherAssignmentId > 0) {
            const assignment = assignmentOptions.find((item) => item.id === selectedTeacherAssignmentId);
            if (assignment) {
                const assignmentKkm = Number(assignment.kkm);
                if (Number.isFinite(assignmentKkm) && assignmentKkm > 0) {
                    setValue('kkm', assignmentKkm);
                }
                if (Number(assignment.subject?.id) > 0 && Number(assignment.subject?.id) !== selectedSubjectId) {
                    setValue('subjectId', Number(assignment.subject.id), { shouldDirty: true });
                }
            }
            return;
        }

        if (selectedSubjectId && subjects.length > 0) {
            const subject = subjects.find((s) => s.id === selectedSubjectId);
            const subjectKkm = Number(subject?.kkm);
            if (Number.isFinite(subjectKkm) && subjectKkm > 0) {
                setValue('kkm', subjectKkm);
            }
        }
    }, [selectedTeacherAssignmentId, assignmentOptions, selectedSubjectId, subjects, setValue]);

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
            setIsQuestionSupportModalOpen(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuestionId]);

    useEffect(() => {
        if (!activeQuestionId) return;

        const tooltips: Array<[string, string]> = [
            ['.ql-picker.ql-header', 'Gaya teks'],
            ['button.ql-bold', 'Tebal'],
            ['button.ql-italic', 'Miring'],
            ['button.ql-underline', 'Garis bawah'],
            ['button.ql-strike', 'Coret'],
            ['button.ql-blockquote', 'Kutipan'],
            ['button.ql-list[value="ordered"]', 'Daftar bernomor'],
            ['button.ql-list[value="bullet"]', 'Daftar bullet'],
            ['button.ql-script[value="sub"]', 'Subscript'],
            ['button.ql-script[value="super"]', 'Superscript'],
            ['button.ql-indent[value="-1"]', 'Kurangi indentasi'],
            ['button.ql-indent[value="+1"]', 'Tambah indentasi'],
            ['button.ql-direction', 'Arah teks kanan-ke-kiri'],
            ['.ql-picker.ql-color', 'Warna teks'],
            ['.ql-picker.ql-background', 'Warna latar teks'],
            ['button.ql-link', 'Tautan'],
            ['button.ql-formula', 'Rumus matematika'],
            ['button.ql-clean', 'Hapus format'],
        ];

        const toolbarNodes = Array.from(
            document.querySelectorAll<HTMLElement>('.question-editor-quill .ql-toolbar'),
        );
        toolbarNodes.forEach((toolbarNode) => {
            tooltips.forEach(([selector, title]) => {
                toolbarNode.querySelectorAll<HTMLElement>(selector).forEach((node) => {
                    node.setAttribute('title', title);
                    node.setAttribute('aria-label', title);
                });
            });
        });
    }, [activeQuestionId]);

    useEffect(() => {
        if (!activeQuestionId) return;

        const quill = quillEditorRef.current?.getEditor();
        if (!quill) return;

        const editorRoot = quill.root as HTMLElement;
        const handleFormulaDblClick = (event: MouseEvent) => {
            const clickedNode = event.target as HTMLElement | null;
            const formulaNode = clickedNode?.closest('.ql-formula') as HTMLElement | null;
            if (!formulaNode) return;

            event.preventDefault();
            event.stopPropagation();

            const currentLatex = formulaNode.getAttribute('data-value') || '';
            const nextLatex = window.prompt('Edit rumus (LaTeX):', currentLatex);
            if (nextLatex === null) return;

            const normalizedLatex = nextLatex.trim();
            if (!normalizedLatex) {
                toast.error('Rumus tidak boleh kosong.');
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quillAny = quill as any;
            const blot = quillAny?.constructor?.find(formulaNode);
            if (!blot) return;

            const index = quill.getIndex(blot);
            quill.deleteText(index, 1, 'user');
            quill.insertEmbed(index, 'formula', normalizedLatex, 'user');
            quill.setSelection(index + 1, 0, 'silent');
            toast.success('Rumus berhasil diperbarui');
        };

        editorRoot.addEventListener('dblclick', handleFormulaDblClick);
        return () => {
            editorRoot.removeEventListener('dblclick', handleFormulaDblClick);
        };
    }, [activeQuestionId]);

    useEffect(() => {
        if (!activeQuestionId) return;

        const quill = quillEditorRef.current?.getEditor();
        if (!quill) return;

        const editorRoot = quill.root as HTMLElement;
        const handleOfficePaste = (event: ClipboardEvent) => {
            const clipboard = event.clipboardData;
            if (!clipboard) return;

            const html = clipboard.getData('text/html');
            const rawText = clipboard.getData('text/plain') || '';
            const hasRtfPayload = clipboardHasRtfPayload(clipboard);
            const needsNormalization =
                hasRtfPayload ||
                (html && shouldNormalizeOfficePaste(html)) ||
                shouldNormalizeOfficePlainText(rawText);
            const shouldSanitizePaste = hasRtfPayload || Boolean(html) || shouldNormalizeOfficePlainText(rawText);
            if (!shouldSanitizePaste) return;

            const plainText = resolveOfficeClipboardText(rawText, html) || normalizeOfficePasteText(rawText || '');
            if (!plainText) return;

            event.preventDefault();

            const selection = quill.getSelection(true);
            const insertIndex = selection ? selection.index : quill.getLength();

            if (selection?.length) {
                quill.deleteText(selection.index, selection.length, 'user');
            }

            quill.insertText(insertIndex, plainText, 'user');
            quill.setSelection(insertIndex + plainText.length, 0, 'silent');
            if (needsNormalization) {
                toast.success('Konten Word dipaste dengan normalisasi simbol rumus agar tetap terbaca.');
            }
        };

        editorRoot.addEventListener('paste', handleOfficePaste as EventListener, true);
        return () => {
            editorRoot.removeEventListener('paste', handleOfficePaste as EventListener, true);
        };
    }, [activeQuestionId]);

    useEffect(() => {
        if (!activeQuestionId) return;

        const cleanupFns: Array<() => void> = [];
        const editorNodes = Array.from(
            document.querySelectorAll<HTMLElement>('.question-editor-quill'),
        );

        editorNodes.forEach((editorNode) => {
            const toolbarNode = editorNode.querySelector<HTMLElement>('.ql-toolbar');
            const containerNode = editorNode.querySelector<HTMLElement>('.ql-container');
            const formulaButton = toolbarNode?.querySelector<HTMLElement>('button.ql-formula');
            if (!toolbarNode || !containerNode || !formulaButton) return;

            const repositionTooltip = () => {
                window.requestAnimationFrame(() => {
                    const tooltipNode = editorNode.querySelector<HTMLElement>('.ql-tooltip.ql-editing');
                    if (!tooltipNode) return;

                    const containerRect = containerNode.getBoundingClientRect();
                    const buttonRect = formulaButton.getBoundingClientRect();
                    const tooltipWidth = tooltipNode.offsetWidth || 260;

                    const preferredLeft =
                        buttonRect.left -
                        containerRect.left +
                        buttonRect.width / 2 -
                        tooltipWidth / 2;

                    const minLeft = 8;
                    const maxLeft = Math.max(minLeft, containerRect.width - tooltipWidth - 8);
                    const clampedLeft = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

                    tooltipNode.style.left = `${clampedLeft}px`;
                    tooltipNode.style.right = 'auto';
                });
            };

            formulaButton.addEventListener('click', repositionTooltip);
            cleanupFns.push(() => formulaButton.removeEventListener('click', repositionTooltip));
        });

        return () => {
            cleanupFns.forEach((cleanup) => cleanup());
        };
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
                    setValue('programCode', normalizeExamProgramCode(presetProgramCode || presetType || '') || '');
                    // Also set semester from active AY if not locked by program
                    if (presetFixedSemester === 'ODD' || presetFixedSemester === 'EVEN') {
                        setValue('semester', presetFixedSemester);
                    } else if (presetPacketDraft?.semester === 'ODD' || presetPacketDraft?.semester === 'EVEN') {
                        setValue('semester', presetPacketDraft.semester);
                    } else {
                        setValue('semester', ayRes.data.semester || 'ODD');
                    }
                }
            }
            
            const assignments = (assignRes.data?.assignments || []) as TeacherAssignment[];
            setAssignmentOptions(assignments);
            const uniqueSubjectsMap = new Map();
            assignments.forEach((a: TeacherAssignment) => {
                if (!uniqueSubjectsMap.has(a.subject.id)) {
                    const assignmentKkm = Number(a.kkm);
                    uniqueSubjectsMap.set(a.subject.id, {
                        ...a.subject,
                        kkm: Number.isFinite(assignmentKkm) && assignmentKkm > 0 ? assignmentKkm : undefined,
                    });
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
            const packet = res.data as ExamPacket;
            setLoadedPacket(packet);
            
            setValue('title', packet.title);
            setValue('description', packet.description || '');
            setValue('type', packet.type);
            setValue('programCode', normalizeExamProgramCode(packet.programCode || packet.type));
            setValue('duration', packet.duration);
            setValue('publishedQuestionCount', packet.publishedQuestionCount || undefined);
            setValue('kkm', packet.kkm);
            setValue('subjectId', Number(packet.subjectId));
            setValue('academicYearId', packet.academicYearId);
            setValue('semester', packet.semester || 'ODD');
            setValue('instructions', packet.instructions || '');
            
            if (packet.questions) {
                const mappedQuestions: ExtendedQuestion[] = packet.questions.map((q) => {
                    const source = q as unknown as ExtendedQuestion;
                    const blueprintSource = source.blueprint ?? source.metadata?.blueprint;
                    const questionCardSource = source.questionCard ?? source.metadata?.questionCard;
                    const matrixPromptColumns = normalizeMatrixPromptColumns(
                        source.matrixPromptColumns ?? source.metadata?.matrixPromptColumns,
                    );
                    const matrixColumns = normalizeMatrixColumns(source.matrixColumns ?? source.metadata?.matrixColumns);
                    return {
                        ...source,
                        content: sanitizeQuestionHtml(source.content),
                        saveToBank: true,
                        question_image_url: source.question_image_url,
                        question_video_url: source.question_video_url,
                        question_video_type: source.question_video_type,
                        blueprint: normalizeBlueprint(blueprintSource),
                        questionCard: normalizeQuestionCard(questionCardSource),
                        matrixPromptColumns,
                        matrixColumns,
                        matrixRows: normalizeMatrixRows(
                            source.matrixRows ?? source.metadata?.matrixRows,
                            matrixPromptColumns,
                            matrixColumns,
                        ),
                        reviewFeedback: normalizeReviewFeedback(source.reviewFeedback ?? source.metadata?.reviewFeedback),
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

    const restoreDraftFromPrompt = () => {
        if (!draftRestorePrompt) return;

        const { draft } = extractExamDraftPayload(draftRestorePrompt.draftRaw);

        if (!draft) {
            setDraftRestorePrompt(null);
            return;
        }

        const form = draft.form;
        if (form) {
            if (typeof form.title === 'string') setValue('title', form.title);
            if (typeof form.description === 'string') setValue('description', form.description);
            if (typeof form.duration === 'number') setValue('duration', form.duration);
            if (typeof form.publishedQuestionCount === 'number') {
                setValue('publishedQuestionCount', form.publishedQuestionCount);
            }
            if (typeof form.instructions === 'string') setValue('instructions', form.instructions);
            if (typeof form.subjectId === 'number') setValue('subjectId', form.subjectId);

            if (presetFixedSemester === 'ODD' || presetFixedSemester === 'EVEN') {
                setValue('semester', presetFixedSemester);
            }

            if (typeof form.saveToBank === 'boolean') setValue('saveToBank', form.saveToBank);

            const programCodeSource =
                typeof presetProgramCode === 'string' && presetProgramCode
                    ? presetProgramCode
                    : typeof form.programCode === 'string'
                      ? form.programCode
                      : typeof form.type === 'string'
                        ? form.type
                        : '';
            setValue('programCode', normalizeExamProgramCode(programCodeSource));
        }

        if (Array.isArray(draft.questions) && draft.questions.length > 0) {
            const restoredQuestions = (draft.questions as ExtendedQuestion[]).map((question) => {
                const matrixPromptColumns = normalizeMatrixPromptColumns(
                    question.matrixPromptColumns ?? question.metadata?.matrixPromptColumns,
                );
                const matrixColumns = normalizeMatrixColumns(question.matrixColumns ?? question.metadata?.matrixColumns);
                return {
                    ...question,
                    content: sanitizeQuestionHtml(question.content),
                    blueprint: normalizeBlueprint(question.blueprint),
                    questionCard: normalizeQuestionCard(question.questionCard),
                    matrixPromptColumns,
                    matrixColumns,
                    matrixRows: normalizeMatrixRows(
                        question.matrixRows ?? question.metadata?.matrixRows,
                        matrixPromptColumns,
                        matrixColumns,
                    ),
                    reviewFeedback: normalizeReviewFeedback(question.reviewFeedback ?? question.metadata?.reviewFeedback),
                };
            });
            setQuestions(restoredQuestions);
            setActiveQuestionId(restoredQuestions[0]?.id || null);
            draftLoadedRef.current = true;
            toast.success('Draft ujian sebelumnya berhasil dipulihkan', { icon: '📝' });
        }

        setDraftRestorePrompt(null);
    };

    const discardDraftFromPrompt = () => {
        if (userId) {
            clearLocalExamDraft(userId);
        }
        if (draftRestorePrompt && userId) {
            const nextPreferences = { ...currentPreferencesRef.current, exam_draft: null };
            syncCachedPreferences(nextPreferences);
            updateProfileMutation.mutate({
                preferences: nextPreferences,
            });
        }
        setDraftRestorePrompt(null);
    };

    const handleDeleteQuestion = (qId: string) => {
        if (questions.length <= 1) {
            toast.error('Minimal harus ada 1 soal');
            return;
        }
        setQuestionPendingDeleteId(qId);
    };

    const updateQuestion = (qId: string | null, updates: Partial<ExtendedQuestion>) => {
        if (!qId) return;
        const normalizedUpdates: Partial<ExtendedQuestion> = { ...updates };
        if (typeof normalizedUpdates.content === 'string') {
            normalizedUpdates.content = sanitizeQuestionHtml(normalizedUpdates.content);
        }
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, ...normalizedUpdates } : q));
    };

    const mutateQuestion = (qId: string | null, updater: (question: ExtendedQuestion) => ExtendedQuestion) => {
        if (!qId) return;
        setQuestions((prev) =>
            prev.map((question) => (question.id === qId ? updater(question) : question)),
        );
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

    const handleImportQuestions = (importedQuestions: Question[]) => {
        let normalizedLegacyScoreCount = 0;
        const newQuestions: ExtendedQuestion[] = importedQuestions.map((q) => {
            const source = q as unknown as ImportedQuestion;
            const sourceOptions = source.options;
            const matrixPromptColumns = normalizeMatrixPromptColumns(
                (source as ImportedQuestion & { matrixPromptColumns?: unknown }).matrixPromptColumns ?? source.metadata?.matrixPromptColumns,
            );

            let questionImageUrl = source.question_image_url || undefined;
            let questionVideoUrl = source.question_video_url || undefined;
            let questionVideoType: ExtendedQuestion['question_video_type'] =
                source.question_video_type === 'youtube' ? 'youtube' : source.question_video_type === 'upload' ? 'upload' : undefined;

            const fallbackMediaUrl = String(source.mediaUrl || source.media_url || '').trim();
            const fallbackMediaType = String(source.mediaType || source.media_type || '').trim().toLowerCase();
            if (!questionImageUrl && !questionVideoUrl && fallbackMediaUrl) {
                const hasImageHint = fallbackMediaType.includes('image') || fallbackMediaType === 'img';
                const hasVideoHint =
                    fallbackMediaType.includes('video') ||
                    fallbackMediaType.includes('youtube') ||
                    fallbackMediaType.includes('vimeo');
                const looksLikeVideo = isLikelyVideoUrl(fallbackMediaUrl);

                if (hasImageHint || (!hasVideoHint && !looksLikeVideo)) {
                    questionImageUrl = fallbackMediaUrl;
                } else {
                    questionVideoUrl = fallbackMediaUrl;
                    questionVideoType =
                        fallbackMediaType.includes('youtube') || fallbackMediaUrl.includes('youtu')
                            ? 'youtube'
                            : 'upload';
                }
            }
            const normalizedScore = normalizeImportedBankScore(source.points, source.score);
            if (normalizedScore.normalizedFromLegacy) {
                normalizedLegacyScoreCount += 1;
            }
            const matrixColumns = normalizeMatrixColumns(source.matrixColumns ?? source.metadata?.matrixColumns);

            return {
                ...q,
                id: Math.random().toString(36).substr(2, 9), // Generate new ID to avoid conflict
                content: sanitizeQuestionHtml(q.content),
                score: normalizedScore.score,
                saveToBank: false, // Don't save back to bank by default since it came from there
                question_image_url: questionImageUrl,
                question_video_url: questionVideoUrl,
                question_video_type: questionVideoType,
                question_media_position: source.question_media_position || 'top',
                blueprint: normalizeBlueprint(q.blueprint ?? q.metadata?.blueprint),
                questionCard: normalizeQuestionCard(q.questionCard ?? q.metadata?.questionCard),
                matrixPromptColumns,
                matrixColumns,
                matrixRows: normalizeMatrixRows(
                    source.matrixRows ?? source.metadata?.matrixRows,
                    matrixPromptColumns,
                    matrixColumns,
                ),
                options: sourceOptions?.map((o) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    content: sanitizeQuestionHtml(o.content),
                    isCorrect: Boolean(o.isCorrect),
                    image_url: o.image_url || o.imageUrl,
                })),
            };
        });

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
        if (normalizedLegacyScoreCount > 0) {
            toast(
                `${normalizedLegacyScoreCount} soal dari bank memakai bobot legacy (>=50) dan dinormalisasi ke bobot 1.`,
                { icon: '⚠️' },
            );
        }
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
                options: newOptions,
                matrixPromptColumns: [],
                matrixColumns: [],
                matrixRows: [],
            });
        }
    };

    const handleTypeChange = (newType: Question['type']) => {
        if (!activeQuestionId) return;
        
        const currentQ = questions.find(q => q.id === activeQuestionId);
        let newOptions = currentQ?.options || [];
        let newMatrixPromptColumns = currentQ?.matrixPromptColumns || [];
        let newMatrixColumns = currentQ?.matrixColumns || [];
        let newMatrixRows = currentQ?.matrixRows || [];

        if (newType === 'TRUE_FALSE') {
             newOptions = [
                { id: Math.random().toString(36).substr(2, 9), content: 'Benar', isCorrect: true },
                { id: Math.random().toString(36).substr(2, 9), content: 'Salah', isCorrect: false },
            ];
            newMatrixPromptColumns = [];
            newMatrixColumns = [];
            newMatrixRows = [];
        } else if (newType === 'MATRIX_SINGLE_CHOICE') {
            newMatrixPromptColumns = normalizeMatrixPromptColumns(currentQ?.matrixPromptColumns);
            if (newMatrixPromptColumns.length === 0) {
                newMatrixPromptColumns = createMatrixPromptColumns();
            }
            newMatrixColumns = normalizeMatrixColumns(currentQ?.matrixColumns);
            if (newMatrixColumns.length === 0) {
                newMatrixColumns = createMatrixColumns();
            }
            newMatrixRows = normalizeMatrixRows(currentQ?.matrixRows, newMatrixPromptColumns, newMatrixColumns);
            if (newMatrixRows.length === 0) {
                newMatrixRows = createMatrixRows(newMatrixPromptColumns, newMatrixColumns);
            }
            newOptions = [];
        } else if ((newType === 'MULTIPLE_CHOICE' || newType === 'COMPLEX_MULTIPLE_CHOICE') && newOptions.length < 2) {
             newOptions = [
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
                { id: Math.random().toString(36).substr(2, 9), content: '', isCorrect: false },
            ];
            newMatrixPromptColumns = [];
            newMatrixColumns = [];
            newMatrixRows = [];
        } else if (newType !== 'ESSAY') {
            newMatrixPromptColumns = [];
            newMatrixColumns = [];
            newMatrixRows = [];
        }

        updateQuestion(activeQuestionId, { 
            type: newType,
            options: newOptions,
            matrixPromptColumns: newMatrixPromptColumns,
            matrixColumns: newMatrixColumns,
            matrixRows: newMatrixRows,
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
            const err = error as { response?: { data?: { message?: string }, status?: number } };
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

    const persistPacket = async (
        data: PacketForm,
        options?: {
            stayOnPage?: boolean;
            successMessage?: string;
        },
    ) => {
        const stayOnPage = Boolean(options?.stayOnPage);
        if (!activeAcademicYear) {
            toast.error('Tahun ajaran aktif tidak ditemukan');
            return;
        }
        if (isCurriculumManagedPacket && !loadedPacket) {
            toast.error('Detail packet kurikulum belum siap.');
            return;
        }
        const normalizedProgramCode = normalizeExamProgramCode(data.programCode || selectedProgramCode || data.type);
        const effectiveProgram =
            selectedProgramMeta ||
            teacherPrograms.find(
                (program) => normalizeExamProgramCode(program.code) === normalizedProgramCode,
            ) ||
            null;
        if (!isCurriculumManagedPacket && !effectiveProgram) {
            toast.error('Program ujian tidak ditemukan. Pilih program ujian aktif terlebih dahulu.');
            return;
        }
        const normalizedTeacherAssignmentId = Number(data.teacherAssignmentId);
        if (!isCurriculumManagedPacket && (!Number.isFinite(normalizedTeacherAssignmentId) || normalizedTeacherAssignmentId <= 0)) {
            toast.error('Pilih assignment mapel-kelas terlebih dahulu.');
            return;
        }
        const effectiveType = isCurriculumManagedPacket
            ? ((loadedPacket?.type || resolvedPacketType || 'FORMATIF') as ExamType)
            : resolveProgramPacketType(
                  effectiveProgram,
                  (data.type || resolvedPacketType || 'FORMATIF') as ExamType,
              );
        const effectiveFixedSemester = isCurriculumManagedPacket
            ? ((loadedPacket?.semester || null) as 'ODD' | 'EVEN' | null)
            : effectiveProgram?.fixedSemester || null;
        try {
            assertFixedSemesterMatch(effectiveFixedSemester, data.semester);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Kombinasi tipe ujian dan semester tidak valid.';
            toast.error(message);
            return;
        }

        if (!isCurriculumManagedPacket && (!data.duration || Number(data.duration) <= 0)) {
            toast.error('Isi durasi waktu ujian');
            return;
        }
        
        if (questions.length === 0) {
            toast.error('Minimal harus ada 1 soal');
            return;
        }

        const finalQuestions = [...questions];

        // Validate Questions
        for (let i = 0; i < finalQuestions.length; i++) {
            const q = finalQuestions[i];
            const hasMedia = q.question_image_url || q.question_video_url;
            const hasContent = normalizeEditorText(q.content);

            if (!hasContent && !hasMedia) {
                 toast.error(`Soal nomor ${i + 1} belum memiliki pertanyaan (Teks atau Media)`);
                 return;
            }

            if (q.type !== 'ESSAY') {
                if (q.type === 'MATRIX_SINGLE_CHOICE') {
                    const matrixPromptColumns = normalizeMatrixPromptColumns(q.matrixPromptColumns);
                    const matrixColumns = normalizeMatrixColumns(q.matrixColumns);
                    const matrixRows = normalizeMatrixRows(q.matrixRows, matrixPromptColumns, matrixColumns);
                    if (matrixPromptColumns.length < 1) {
                        toast.error(`Soal nomor ${i + 1} harus memiliki minimal 1 kolom data pada Pilihan Ganda Grid`);
                        return;
                    }
                    if (matrixColumns.length < 2) {
                        toast.error(`Soal nomor ${i + 1} harus memiliki minimal 2 kolom jawaban pada Pilihan Ganda Grid`);
                        return;
                    }
                    if (matrixRows.length < 1) {
                        toast.error(`Soal nomor ${i + 1} harus memiliki minimal 1 pernyataan pada Pilihan Ganda Grid`);
                        return;
                    }
                    if (
                        matrixRows.some(
                            (row) =>
                                !String(row.content || '').trim() &&
                                !(Array.isArray(row.cells) && row.cells.some((cell) => String(cell.content || '').trim())),
                        )
                    ) {
                        toast.error(`Setiap baris pada soal nomor ${i + 1} wajib memiliki isi minimal pada salah satu kolom data`);
                        return;
                    }
                    if (matrixRows.some((row) => !row.correctOptionId)) {
                        toast.error(`Setiap pernyataan pada soal nomor ${i + 1} wajib memiliki 1 kunci jawaban`);
                        return;
                    }
                } else {
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
        }

        const sanitizedQuestions = finalQuestions.map((question, index) =>
            sanitizeQuestionForSubmit(question, index, supportsQuestionSupport),
        );

        const payload = {
            ...data,
            type: effectiveType,
            programCode: isCurriculumManagedPacket
                ? normalizeExamProgramCode(loadedPacket?.programCode || loadedPacket?.type || normalizedProgramCode)
                : normalizedProgramCode,
            teacherAssignmentId: isCurriculumManagedPacket ? undefined : normalizedTeacherAssignmentId,
            duration: isCurriculumManagedPacket ? Number(loadedPacket?.duration || data.duration || 0) : Number(data.duration),
            publishedQuestionCount:
                isCurriculumManagedPacket
                    ? Number.isFinite(Number(loadedPacket?.publishedQuestionCount)) &&
                      Number(loadedPacket?.publishedQuestionCount) > 0
                        ? Math.trunc(Number(loadedPacket?.publishedQuestionCount))
                        : null
                    : Number.isFinite(Number(data.publishedQuestionCount)) &&
                        Number(data.publishedQuestionCount) > 0
                      ? Math.trunc(Number(data.publishedQuestionCount))
                      : null,
            kkm: isCurriculumManagedPacket
                ? Number.isFinite(Number(loadedPacket?.kkm)) && Number(loadedPacket?.kkm) > 0
                    ? Number(loadedPacket?.kkm)
                    : undefined
                : Number.isFinite(Number(data.kkm)) && Number(data.kkm) > 0
                  ? Number(data.kkm)
                  : undefined,
            academicYearId: isCurriculumManagedPacket
                ? Number(loadedPacket?.academicYearId || data.academicYearId)
                : Number(data.academicYearId),
            subjectId: isCurriculumManagedPacket
                ? Number(loadedPacket?.subjectId || data.subjectId || 0)
                : Number(data.subjectId || 0),
            semester:
                isCurriculumManagedPacket
                    ? String(loadedPacket?.semester || data.semester || '').toUpperCase()
                    : effectiveFixedSemester === 'ODD' || effectiveFixedSemester === 'EVEN'
                    ? effectiveFixedSemester
                    : data.semester,
            questions: sanitizedQuestions,
        };

        try {
            if (payload.publishedQuestionCount && payload.publishedQuestionCount > finalQuestions.length) {
                toast.error(
                    `Jumlah soal tayang (${payload.publishedQuestionCount}) tidak boleh melebihi total bank soal (${finalQuestions.length}).`,
                );
                return;
            }
            setLoading(true);
            isSubmittingRef.current = true; // Block draft saving

            const response = isEditMode
                ? await examService.updatePacket(parseInt(id!), payload)
                : await examService.createPacket(payload);
            const savedPacket = (response as { data?: ExamPacket } | undefined)?.data;
            const savedPacketId = Number(
                (response as { data?: { id?: number }; id?: number } | undefined)?.data?.id ||
                    (response as { id?: number } | undefined)?.id ||
                    id ||
                    0,
            );
            const savedMediaAudit = savedPacket?.mediaAudit;

            if (savedMediaAudit) {
                setLoadedPacket((current) =>
                    current
                        ? {
                              ...current,
                              mediaAudit: savedMediaAudit,
                          }
                        : current,
                );
            }

            if (isEditMode) {
                toast.success(options?.successMessage || 'Paket ujian berhasil diperbarui');
            } else {
                toast.success(options?.successMessage || 'Paket ujian berhasil dibuat');
                // Clear draft only on successful create
                if (userId) {
                    clearLocalExamDraft(userId);
                    const currentPrefs = currentPreferencesRef.current || {};
                    const nextPreferences = { ...currentPrefs, exam_draft: null };
                    syncCachedPreferences(nextPreferences);
                    updateProfileMutation.mutate({
                        preferences: nextPreferences
                    });
                }
            }

            if (savedMediaAudit?.missingOriginalCount) {
                toast.error(
                    `Audit media menemukan ${savedMediaAudit.missingOriginalCount} file gambar hilang. Rapikan paket ini sebelum dipakai siswa.`,
                );
            } else if (savedMediaAudit?.missingThumbnailCount) {
                toast(
                    `Audit media menemukan ${savedMediaAudit.missingThumbnailCount} thumbnail yang belum siap. Siswa tetap aman, tetapi media sebaiknya dirapikan.`,
                    {
                        icon: '⚠️',
                    },
                );
            }

            await queryClient.invalidateQueries({ queryKey: ['exam-packets'] });
            await queryClient.invalidateQueries({ queryKey: ['bank-questions'] });

            if (stayOnPage) {
                if (!isEditMode && savedPacketId > 0) {
                    navigate(`/teacher/exams/${savedPacketId}/edit`, {
                        replace: true,
                        state: {
                            type: effectiveType,
                            programCode: payload.programCode,
                            programLabel: presetProgramLabel || effectiveProgram?.label || effectiveProgram?.code || effectiveType,
                            fixedSemester: effectiveFixedSemester,
                        },
                    });
                }
                return;
            }

            navigate(-1);
        } catch (error: unknown) {
            console.error('Error saving packet:', error);
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Gagal menyimpan paket ujian');
        } finally {
            isSubmittingRef.current = false;
            setLoading(false);
        }
    };
    const handlePrimarySave = handleSubmit((data) => persistPacket(data));
    const handleQuestionSupportSave = handleSubmit((data) =>
        persistPacket(data, {
            stayOnPage: true,
            successMessage: 'Kisi-kisi & kartu soal berhasil disimpan.',
        }),
    );

    const activeQuestion = questions.find(q => q.id === activeQuestionId);
    const activeQuestionBlueprint = activeQuestion
        ? normalizeBlueprint(activeQuestion.blueprint)
        : createDefaultBlueprint();
    const activeQuestionCard = activeQuestion
        ? buildDerivedQuestionCard(activeQuestion)
        : createDefaultQuestionCard();
    const activeQuestionReviewFeedback = activeQuestion
        ? normalizeReviewFeedback(activeQuestion.reviewFeedback ?? activeQuestion.metadata?.reviewFeedback)
        : undefined;
    const activeQuestionIndex = activeQuestionId ? questions.findIndex((question) => question.id === activeQuestionId) : 0;

    useEffect(() => {
        if (!requestedQuestionId || questions.length === 0) return;
        const matchedQuestion = questions.find((question) => String(question.id) === requestedQuestionId);
        if (!matchedQuestion) return;
        if (activeQuestionId !== matchedQuestion.id) {
            setActiveQuestionId(matchedQuestion.id);
        }
    }, [requestedQuestionId, questions, activeQuestionId]);

    useEffect(() => {
        setReviewReplyDraft(String(activeQuestionReviewFeedback?.teacherResponse || ''));
    }, [activeQuestionReviewFeedback?.teacherResponse, activeQuestion?.id]);

    const activeQuestionSupportSnapshot = getExamQuestionSupportSnapshot(
        activeQuestion
            ? {
                ...activeQuestion,
                blueprint: activeQuestionBlueprint,
                questionCard: activeQuestionCard,
            }
            : null,
    );
    const activeQuestionSupportMeta = getExamQuestionSupportStatusMeta(activeQuestionSupportSnapshot.overallStatus);
    const activeBlueprintSupportMeta = getExamQuestionSupportStatusMeta(activeQuestionSupportSnapshot.blueprintStatus);
    const activeQuestionCardSupportMeta = getExamQuestionSupportStatusMeta(activeQuestionSupportSnapshot.questionCardStatus);
    const hasActiveReviewFeedback = Boolean(
        activeQuestionReviewFeedback?.questionComment ||
        activeQuestionReviewFeedback?.blueprintComment ||
        activeQuestionReviewFeedback?.questionCardComment,
    );
    const activeQuestionReviewExpanded = Boolean(activeQuestion?.id && expandedReviewNotes[activeQuestion.id]);
    const hasBlueprintReferenceOptions = Object.values(blueprintReferenceOptionsByField).some((options) => options.length > 0);

    const applyBlueprintReferenceOption = (
        qId: string,
        field: BlueprintReferenceField,
        optionKey: string,
    ) => {
        const selectedOption = blueprintReferenceOptionsByField[field].find((option) => option.optionKey === optionKey);
        if (!selectedOption) return;
        const question = questions.find((item) => item.id === qId);
        const currentBlueprint = normalizeBlueprint(question?.blueprint);
        const snapshot = selectedOption.snapshot || {};
        const nextBlueprint: QuestionBlueprint = { ...currentBlueprint };

        if (field === 'competency') {
            nextBlueprint.competency =
                getSnapshotValue(snapshot, ['capaian_pembelajaran', 'kompetensi', 'elemen']) ||
                selectedOption.value;
        }

        if (field === 'learningObjective') {
            nextBlueprint.learningObjective =
                getSnapshotValue(snapshot, ['tujuan_pembelajaran']) ||
                selectedOption.value;
            const materialFromSnapshot = getSnapshotValue(snapshot, ['materi_pokok', 'konten_materi']);
            if (materialFromSnapshot) {
                nextBlueprint.materialScope = materialFromSnapshot;
            }
        }

        if (field === 'materialScope') {
            nextBlueprint.materialScope =
                getSnapshotValue(snapshot, ['materi_pokok', 'konten_materi']) ||
                selectedOption.value;
        }

        if (field === 'indicator') {
            nextBlueprint.indicator =
                getSnapshotValue(snapshot, ['indikator_ketercapaian', 'indikator_ketercapaian_tp', 'iktp', 'indikator']) ||
                selectedOption.value;
        }

        updateQuestion(qId, { blueprint: nextBlueprint });
        toast.success('Referensi perangkat ajar diterapkan.');
    };

    const renderBlueprintReferenceSelect = (
        field: BlueprintReferenceField,
        placeholder: string,
    ) => {
        const options = blueprintReferenceOptionsByField[field];
        if (!activeQuestion?.id || options.length === 0) return null;
        return (
            <select
                value=""
                onChange={(event) => {
                    const optionKey = event.target.value;
                    if (!optionKey) return;
                    applyBlueprintReferenceOption(activeQuestion.id, field, optionKey);
                }}
                className="mb-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
            >
                <option value="">{placeholder}</option>
                {options.map((option) => (
                    <option key={option.optionKey} value={option.optionKey}>
                        {buildReferenceOptionText(option)}
                    </option>
                ))}
            </select>
        );
    };

    const toggleActiveQuestionReview = () => {
        if (!activeQuestion?.id) return;
        setExpandedReviewNotes((current) => ({
            ...current,
            [activeQuestion.id]: !current[activeQuestion.id],
        }));
    };

    const getOptionHistoryKey = (questionId: string, optionId: string) => `question:${questionId}:option:${optionId}`;

    const registerOptionTextHistoryChange = (historyKey: string, currentValue: string, nextValue: string) => {
        if (currentValue === nextValue) return;
        const currentEntry = optionTextHistoryRef.current[historyKey] || { past: [], future: [] };
        const nextPast = [...currentEntry.past];
        if (nextPast[nextPast.length - 1] !== currentValue) {
            nextPast.push(currentValue);
        }
        if (nextPast.length > 60) {
            nextPast.splice(0, nextPast.length - 60);
        }
        optionTextHistoryRef.current[historyKey] = {
            past: nextPast,
            future: [],
        };
        setOptionHistoryVersion((value) => value + 1);
    };

    const canUndoOptionText = (historyKey: string) =>
        Boolean((optionTextHistoryRef.current[historyKey]?.past.length || 0) > 0);
    const canRedoOptionText = (historyKey: string) =>
        Boolean((optionTextHistoryRef.current[historyKey]?.future.length || 0) > 0);

    const applyOptionEditorValue = (optionId: string, nextValue: string) => {
        if (!activeQuestion?.options) return;
        const newOptions = activeQuestion.options.map((candidate) =>
            candidate.id === optionId
                ? { ...candidate, content: normalizeOptionStorageText(nextValue) }
                : candidate,
        );
        updateQuestion(activeQuestion.id, { options: newOptions });
    };

    const undoOptionText = (optionId: string) => {
        if (!activeQuestion?.options) return;
        const option = activeQuestion.options.find((candidate) => candidate.id === optionId);
        if (!option) return;
        const historyKey = getOptionHistoryKey(activeQuestion.id, optionId);
        const currentEntry = optionTextHistoryRef.current[historyKey];
        if (!currentEntry?.past.length) return;
        const currentValue = normalizeOptionEditorText(option.content);
        const nextValue = currentEntry.past[currentEntry.past.length - 1] || '';
        optionTextHistoryRef.current[historyKey] = {
            past: currentEntry.past.slice(0, -1),
            future: [currentValue, ...currentEntry.future].slice(0, 60),
        };
        applyOptionEditorValue(optionId, nextValue);
        setOptionHistoryVersion((value) => value + 1);
    };

    const redoOptionText = (optionId: string) => {
        if (!activeQuestion?.options) return;
        const option = activeQuestion.options.find((candidate) => candidate.id === optionId);
        if (!option) return;
        const historyKey = getOptionHistoryKey(activeQuestion.id, optionId);
        const currentEntry = optionTextHistoryRef.current[historyKey];
        if (!currentEntry?.future.length) return;
        const currentValue = normalizeOptionEditorText(option.content);
        const nextValue = currentEntry.future[0] || '';
        optionTextHistoryRef.current[historyKey] = {
            past: [...currentEntry.past, currentValue].slice(-60),
            future: currentEntry.future.slice(1),
        };
        applyOptionEditorValue(optionId, nextValue);
        setOptionHistoryVersion((value) => value + 1);
    };

    const handleQuestionEditorUndo = () => {
        const editor = quillEditorRef.current?.getEditor?.();
        editor?.history?.undo();
    };

    const handleQuestionEditorRedo = () => {
        const editor = quillEditorRef.current?.getEditor?.();
        editor?.history?.redo();
    };

    const submitReviewReply = async () => {
        const packetId = Number(id || loadedPacket?.id || 0);
        const questionId = String(activeQuestion?.id || '').trim();
        const teacherResponse = reviewReplyDraft.trim();
        if (!packetId || !questionId) {
            toast.error('Butir soal belum tersedia untuk dibalas.');
            return;
        }
        if (!teacherResponse) {
            toast.error('Balasan guru wajib diisi.');
            return;
        }

        setReviewReplySubmitting(true);
        try {
            const response = await examService.replyPacketReviewFeedback(packetId, {
                questionId,
                teacherResponse,
            });
            const nextFeedback = response.data?.reviewFeedback || null;
            setQuestions((current) =>
                current.map((question) =>
                    String(question.id || '') === questionId
                        ? {
                              ...question,
                              reviewFeedback: nextFeedback || undefined,
                              metadata: {
                                  ...(question.metadata || {}),
                                  reviewFeedback: nextFeedback || undefined,
                              },
                          }
                        : question,
                ),
            );
            window.dispatchEvent(new CustomEvent('sis:notifications:refresh'));
            toast.success('Balasan review berhasil dikirim ke kurikulum.');
        } catch (error: unknown) {
            console.error('Error replying review feedback:', error);
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Gagal mengirim balasan review.');
        } finally {
            setReviewReplySubmitting(false);
        }
    };
    const previewQuestions = useMemo<ExamStudentPreviewQuestion[]>(
        () =>
            questions.map((question, index) => ({
                id: String(question.id || `question-${index + 1}`),
                type: question.type,
                content: sanitizeQuestionHtml(question.content),
                question_image_url: question.question_image_url || null,
                image_url: question.question_image_url || null,
                question_video_url: question.question_video_url || null,
                video_url: question.question_video_url || null,
                question_video_type: question.question_video_type || null,
                question_media_position: question.question_media_position || 'top',
                matrixPromptColumns: normalizeMatrixPromptColumns(question.matrixPromptColumns),
                matrixColumns: normalizeMatrixColumns(question.matrixColumns),
                matrixRows: normalizeMatrixRows(
                    question.matrixRows,
                    normalizeMatrixPromptColumns(question.matrixPromptColumns),
                    normalizeMatrixColumns(question.matrixColumns),
                ),
                options: Array.isArray(question.options)
                    ? question.options.map((option, optionIndex) => ({
                          id: String(option.id || `option-${index + 1}-${optionIndex + 1}`),
                          content: String(option.content || ''),
                          image_url: option.image_url || null,
                          option_image_url: option.image_url || null,
                      }))
                    : [],
            })),
        [questions],
    );

    const normalizeEditorText = (value: string | undefined | null) =>
        String(value || '')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();

    const normalizeOptionEditorText = (value: string | undefined | null) =>
        String(value || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p>/gi, '\n')
            .replace(/<p>/gi, '')
            .replace(/<\/p>/gi, '')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ');

    const normalizeOptionStorageText = (value: string | undefined | null) =>
        String(value || '').replace(/\r\n|\r|\n/g, '<br/>');

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

    const renderQuestionCardStimulusPreview = (question?: ExtendedQuestion | null) => {
        if (!question) {
            return (
                <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-500">
                    Belum ada teks soal.
                </div>
            );
        }

        const questionHtml = enhanceQuestionHtml(sanitizeQuestionHtml(question.content), {
            useQuestionImageThumbnail: false,
        });
        const hasQuestionMedia = Boolean(question.question_image_url || question.question_video_url);
        const hasOptions = Array.isArray(question.options) && question.options.length > 0;

        return (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700">
                {questionHtml ? (
                    <div
                        className="prose prose-sm max-w-none text-slate-800"
                        dangerouslySetInnerHTML={{ __html: questionHtml }}
                    />
                ) : (
                    <p className="text-slate-500">Belum ada teks soal.</p>
                )}

                {hasQuestionMedia ? (
                    <div className="space-y-3">
                        {question.question_image_url ? (
                            <img
                                src={question.question_image_url}
                                alt="Media soal"
                                className="max-h-56 rounded-xl border border-emerald-100"
                            />
                        ) : null}
                        {question.question_video_url ? (
                            question.question_video_type === 'youtube' ? (
                                <div className="aspect-video w-full overflow-hidden rounded-xl border border-emerald-100">
                                    <iframe
                                        src={question.question_video_url}
                                        className="h-full w-full"
                                        allowFullScreen
                                        title="Media video soal"
                                    />
                                </div>
                            ) : (
                                <video
                                    src={question.question_video_url}
                                    controls
                                    className="max-h-64 w-full rounded-xl border border-emerald-100"
                                />
                            )
                        ) : null}
                    </div>
                ) : null}

                {hasOptions ? (
                    <div className="space-y-2">
                        {(question.options || []).map((option, index) => (
                            <div
                                key={option.id || `${question.id}-preview-${index}`}
                                className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2"
                            >
                                <div className="mb-1 text-xs font-semibold text-emerald-700">
                                    Opsi {getQuestionOptionLabel(index)}
                                </div>
                                {String(option.content || '').trim() ? (
                                    <div
                                        className="prose prose-sm max-w-none text-slate-700"
                                        dangerouslySetInnerHTML={{
                                            __html: enhanceQuestionHtml(String(option.content || ''), {
                                                useQuestionImageThumbnail: false,
                                            }),
                                        }}
                                    />
                                ) : (
                                    <p className="text-xs text-slate-500">Opsi tanpa teks.</p>
                                )}
                                {option.image_url ? (
                                    <img
                                        src={option.image_url}
                                        alt={`Media opsi ${getQuestionOptionLabel(index)}`}
                                        className="mt-2 max-h-40 rounded-lg border border-emerald-100"
                                    />
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
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
    const totalScore = questions.reduce((acc, q) => acc + normalizePositiveScore(q.score, 0), 0);
    const completedQuestionCount = questions.filter((q) => Boolean(normalizeEditorText(q.content))).length;
    const selectedSubjectName = isCurriculumManagedPacket
        ? String(loadedPacket?.subject?.name || '-').trim() || '-'
        : subjects.find((subject) => subject.id == selectedSubjectId)?.name || '-';
    const examTitle = (watch('title') || '').trim();
    const currentDuration = Number(watch('duration') || 0);
    const currentAcademicYearId = Number(watch('academicYearId') || activeAcademicYear?.id || 0);
    const isPacketInfoComplete = isCurriculumManagedPacket
        ? Boolean(examTitle && currentAcademicYearId > 0)
        : Boolean(
              examTitle &&
                  selectedSubjectId &&
                  currentDuration > 0 &&
                  selectedPacketSemester &&
                  currentAcademicYearId > 0 &&
                  selectedProgramCode,
          );

    const handleSaveInfoModal = () => {
        if (!examTitle) {
            toast.error('Judul ujian wajib diisi');
            return;
        }
        if (!isCurriculumManagedPacket && !selectedSubjectId) {
            toast.error('Mata pelajaran wajib dipilih');
            return;
        }
        if (!isCurriculumManagedPacket && (!currentDuration || currentDuration <= 0)) {
            toast.error('Durasi ujian wajib diisi');
            return;
        }
        setIsInfoModalOpen(false);
        toast.success(isCurriculumManagedPacket ? 'Judul dan instruksi ujian disimpan' : 'Informasi ujian disimpan');
    };

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
                        
                        <div className="flex-1 min-w-0">
                            <p className="text-xs uppercase tracking-wider text-gray-500">Buat Ujian Baru</p>
                            <p className="truncate text-base font-semibold text-slate-800">
                                {examTitle || 'Judul belum diisi'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {/* Total Score Indicator */}
                        <div className="hidden md:flex flex-col items-end mr-2 px-3 py-1 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Bobot</span>
                            <span className="text-sm font-bold text-blue-600">{totalScore}</span>
                        </div>

                        <button 
                            onClick={handlePrimarySave}
                            disabled={loading}
                            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                        >
                            {loading ? <span className="animate-spin text-white">⏳</span> : <Save className="w-4 h-4" />}
                            <span>{loading ? 'Menyimpan...' : 'Simpan'}</span>
                        </button>
                    </div>
                </div>

                <div className="px-6 py-3 bg-slate-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-700">
                        <span className="font-semibold">{selectedSubjectName}</span>
                        <span className="text-slate-500"> • {examTypeDisplayLabel}</span>
                        <span className="text-slate-500"> • {selectedPacketSemester === 'ODD' ? 'Ganjil' : 'Genap'}</span>
                        <span className="text-slate-500"> • Soal terisi: {completedQuestionCount}/{questions.length}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {!isPacketInfoComplete && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                Lengkapi informasi ujian
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsInfoModalOpen(true)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                        >
                            Informasi Ujian
                        </button>
                        {supportsQuestionSupport && activeQuestion ? (
                            <button
                                type="button"
                                onClick={() => setIsQuestionSupportModalOpen(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <span>Kisi-kisi & Kartu Soal</span>
                                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${activeQuestionSupportMeta.badgeClassName}`}>
                                    {activeQuestionSupportMeta.label}
                                </span>
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setIsStudentPreviewOpen(true)}
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                        >
                            <Eye className="h-4 w-4" />
                            Preview Sebagai Siswa
                        </button>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-white/95">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="font-medium text-gray-700 text-sm flex items-center gap-2">
                                <LayoutGrid className="w-4 h-4" />
                                Daftar Soal
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                                Navigasi nomor soal tetap melekat di header agar perpindahan butir lebih cepat saat editor discroll.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
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

                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {questions.map((q, idx) => {
                            const isActive = activeQuestionId === q.id;
                            const hasContent = Boolean(normalizeEditorText(q.content));
                            return (
                                <div key={q.id} className="relative group">
                                    <button
                                        onClick={() => {
                                            setActiveQuestionId(q.id);
                                        }}
                                        className={`
                                            flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all relative
                                            ${isActive 
                                                ? 'bg-blue-600 text-white shadow-md' 
                                                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'}
                                        `}
                                    >
                                        {idx + 1}
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
            </div>

            {/* MAIN CONTENT AREA - FULL WIDTH */}
            <div className="space-y-6">
                {!isPacketInfoComplete && (
                    <div className="bg-white rounded-xl border border-amber-200 px-4 py-3 text-sm text-amber-700">
                        Lengkapi popup <span className="font-semibold">Informasi Ujian</span> sebelum final simpan paket.
                    </div>
                )}
                <ExamPacketMediaAuditGuard
                    audit={loadedPacket?.mediaAudit}
                    contextLabel="paket soal ini"
                />
                {activeQuestion ? (
                    <div className="exam-editor-modal bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                                                <option value="MATRIX_SINGLE_CHOICE">Pilihan Ganda Grid</option>
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

                            <div className="flex items-end self-end gap-2">
                                <label
                                    htmlFor={`question-save-to-bank-${activeQuestion.id}`}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                >
                                    <BookCopy className="h-4 w-4 text-slate-500" />
                                    <input
                                        id={`question-save-to-bank-${activeQuestion.id}`}
                                        type="checkbox"
                                        checked={activeQuestion.saveToBank ?? true}
                                        onChange={(event) =>
                                            updateQuestion(activeQuestion.id, { saveToBank: event.target.checked })
                                        }
                                        className="h-4 w-4"
                                        style={{ accentColor: '#94a3b8' }}
                                    />
                                    Simpan ke Bank Soal
                                </label>
                                <button 
                                    onClick={() => handleDeleteQuestion(activeQuestion.id)}
                                    className="px-4 py-2 bg-white text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300 font-medium flex items-center gap-2 text-sm shadow-sm"
                                    title="Hapus Soal"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Hapus Soal
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                                            Pertanyaan No. {questions.findIndex(q => q.id === activeQuestionId) + 1}
                                        </label>
                                        <p className="text-[11px] text-slate-500">
                                            Mendukung teks Arab, Jepang, Mandarin, aksara Jawa, dan aksara Sunda (gunakan keyboard bahasa di perangkat).
                                        </p>

                                        {hasActiveReviewFeedback ? (
                                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                                <button
                                                    type="button"
                                                    onClick={toggleActiveQuestionReview}
                                                    className="flex w-full items-center justify-between gap-3 text-left"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <span
                                                            className={`inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-500 ${
                                                                activeQuestionReviewExpanded ? '' : 'exam-review-attention-pulse'
                                                            }`}
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="font-semibold">Catatan Review Kurikulum</div>
                                                            <div className="text-[11px] text-amber-700">
                                                                {activeQuestionReviewExpanded
                                                                    ? 'Klik untuk menutup detail review.'
                                                                    : 'Klik untuk membuka detail review dan balasan guru.'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[11px] text-amber-700">
                                                        {activeQuestionReviewFeedback?.reviewer?.name || activeQuestionReviewFeedback?.reviewedAt ? (
                                                            <span className="truncate">
                                                                {activeQuestionReviewFeedback?.reviewer?.name
                                                                    ? `Oleh ${activeQuestionReviewFeedback.reviewer.name}`
                                                                    : 'Catatan tersimpan'}
                                                                {activeQuestionReviewFeedback?.reviewedAt
                                                                    ? ` • ${activeQuestionReviewFeedback.reviewedAt}`
                                                                    : ''}
                                                            </span>
                                                        ) : null}
                                                        {activeQuestionReviewExpanded ? (
                                                            <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4 flex-shrink-0" />
                                                        )}
                                                    </div>
                                                </button>

                                                {activeQuestionReviewExpanded ? (
                                                    <>
                                                        <div className="mt-3 space-y-2 text-xs leading-5 text-amber-900">
                                                            {activeQuestionReviewFeedback?.questionComment ? (
                                                                <div>
                                                                    <span className="font-semibold">Soal:</span> {activeQuestionReviewFeedback.questionComment}
                                                                </div>
                                                            ) : null}
                                                            {activeQuestionReviewFeedback?.blueprintComment ? (
                                                                <div>
                                                                    <span className="font-semibold">Kisi-kisi:</span> {activeQuestionReviewFeedback.blueprintComment}
                                                                </div>
                                                            ) : null}
                                                            {activeQuestionReviewFeedback?.questionCardComment ? (
                                                                <div>
                                                                    <span className="font-semibold">Kartu soal:</span> {activeQuestionReviewFeedback.questionCardComment}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        {activeQuestionReviewFeedback?.teacherResponse ? (
                                                            <div className="mt-3 rounded-2xl border border-blue-200 bg-white/80 px-4 py-3 text-xs text-slate-700">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div className="font-semibold text-blue-700">Balasan Guru</div>
                                                                    {activeQuestionReviewFeedback?.teacherResponder?.name || activeQuestionReviewFeedback?.teacherRespondedAt ? (
                                                                        <div className="text-[11px] text-slate-500">
                                                                            {activeQuestionReviewFeedback?.teacherResponder?.name
                                                                                ? `Oleh ${activeQuestionReviewFeedback.teacherResponder.name}`
                                                                                : 'Balasan tersimpan'}
                                                                            {activeQuestionReviewFeedback?.teacherRespondedAt
                                                                                ? ` • ${activeQuestionReviewFeedback.teacherRespondedAt}`
                                                                                : ''}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                <p className="mt-2 leading-5">{activeQuestionReviewFeedback.teacherResponse}</p>
                                                            </div>
                                                        ) : null}
                                                        <div className="mt-3 rounded-2xl border border-amber-200 bg-white/80 px-4 py-3">
                                                            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                                                Balas Catatan ke Kurikulum
                                                            </label>
                                                            <textarea
                                                                value={reviewReplyDraft}
                                                                onChange={(event) => setReviewReplyDraft(event.target.value)}
                                                                rows={3}
                                                                className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
                                                                placeholder="Jelaskan perbaikan yang sudah dilakukan agar kurikulum bisa meninjau ulang."
                                                            />
                                                            <div className="mt-3 flex justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void submitReviewReply()}
                                                                    disabled={reviewReplySubmitting}
                                                                    className="inline-flex items-center rounded-2xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                                                                >
                                                                    {reviewReplySubmitting ? 'Mengirim Balasan...' : 'Kirim Balasan ke Kurikulum'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {(!activeQuestion.question_media_position || activeQuestion.question_media_position === 'top') && renderMediaPreview(activeQuestion)}

                                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-b-0 border-gray-200 bg-slate-50 px-3 py-2">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                Editor Soal
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleQuestionEditorUndo}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                                >
                                                    <Undo2 className="h-3.5 w-3.5" />
                                                    Undo
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleQuestionEditorRedo}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                                >
                                                    <Redo2 className="h-3.5 w-3.5" />
                                                    Redo
                                                </button>
                                            </div>
                                        </div>

                                        <div className="rounded-b-xl overflow-hidden border border-gray-200 focus-within:border-blue-500 transition-colors shadow-sm">
                                            <ReactQuill
                                                ref={quillEditorRef}
                                                key={activeQuestion.id}
                                                theme="snow"
                                                value={activeQuestion.content}
                                                onChange={(content) => updateQuestion(activeQuestion.id, { content })}
                                                modules={modules}
                                                className="question-editor-quill bg-white min-h-[150px]"
                                            />
                                        </div>

                                        {activeQuestion.question_media_position === 'bottom' && renderMediaPreview(activeQuestion)}

                                        <div className="flex flex-wrap items-center gap-4">
                                            <label htmlFor="upload-question-image" className="cursor-pointer flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-normal shadow-sm">
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

                                            <label htmlFor="upload-question-video" className="cursor-pointer flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all text-sm font-normal shadow-sm">
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
                                    </div>

                                    {activeQuestion.type === 'MATRIX_SINGLE_CHOICE' && (
                                        (() => {
                                            const promptColumns = ensureMatrixPromptColumnsForEditor(activeQuestion.matrixPromptColumns);
                                            const answerColumns = ensureMatrixColumnsForEditor(activeQuestion.matrixColumns);
                                            const rows = ensureMatrixRowsForEditor(activeQuestion.matrixRows, promptColumns, answerColumns);
                                            return (
                                                <div className="mt-4 space-y-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                                                    <div className="rounded-2xl border border-blue-100 bg-white/80 p-4">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                                                            Struktur Grid
                                                        </p>
                                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                                            Grid ini sekarang dinamis. Untuk contoh seperti tabel benar/salah, isi kolom data
                                                            misalnya <span className="font-semibold text-slate-700">Besaran</span>,{' '}
                                                            <span className="font-semibold text-slate-700">Satuan</span>,{' '}
                                                            <span className="font-semibold text-slate-700">Alat Ukur</span>, lalu biarkan
                                                            kolom jawaban <span className="font-semibold text-slate-700">Benar</span> dan{' '}
                                                            <span className="font-semibold text-slate-700">Salah</span>.
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <div className="mb-2 flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                                                                    Kolom Data
                                                                </p>
                                                                <p className="text-sm text-slate-600">
                                                                    Kolom ini menjelaskan isi baris, misalnya Pernyataan, Besaran, atau Satuan.
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newColumnId = Math.random().toString(36).substr(2, 9);
                                                                    updateQuestion(activeQuestion.id, {
                                                                        matrixPromptColumns: [
                                                                            ...promptColumns,
                                                                            {
                                                                                id: newColumnId,
                                                                                label: '',
                                                                            },
                                                                        ],
                                                                        matrixRows: rows.map((row) => ({
                                                                            ...row,
                                                                            cells: [
                                                                                ...(Array.isArray(row.cells) ? row.cells : []),
                                                                                { columnId: newColumnId, content: '' },
                                                                            ],
                                                                        })),
                                                                    });
                                                                }}
                                                                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                                                            >
                                                                Tambah Kolom Data
                                                            </button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {promptColumns.map((column, columnIndex) => (
                                                                <div key={column.id} className="flex items-center gap-2">
                                                                    <span className="w-8 flex-shrink-0 rounded-md border border-blue-200 bg-white px-2 py-2 text-center text-xs font-semibold text-blue-700">
                                                                        {columnIndex + 1}
                                                                    </span>
                                                                    <input
                                                                        value={column.label}
                                                                        onChange={(event) => {
                                                                            const nextPromptColumns = promptColumns.map((item) =>
                                                                                item.id === column.id ? { ...item, label: event.target.value } : item,
                                                                            );
                                                                            updateQuestion(activeQuestion.id, {
                                                                                matrixPromptColumns: nextPromptColumns,
                                                                                matrixRows: rows.map((row) => ({
                                                                                    ...row,
                                                                                    cells: nextPromptColumns.map((nextColumn) => {
                                                                                        const existingCell = Array.isArray(row.cells)
                                                                                            ? row.cells.find((cell) => cell.columnId === nextColumn.id)
                                                                                            : null;
                                                                                        return {
                                                                                            columnId: nextColumn.id,
                                                                                            content: existingCell?.content || '',
                                                                                        };
                                                                                    }),
                                                                                })),
                                                                            });
                                                                        }}
                                                                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                                                                        placeholder={`Kolom data ${columnIndex + 1}`}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (promptColumns.length <= 1) {
                                                                                toast.error('Pilihan Ganda Grid minimal harus punya 1 kolom data.');
                                                                                return;
                                                                            }
                                                                            const nextPromptColumns = promptColumns.filter((item) => item.id !== column.id);
                                                                            updateQuestion(activeQuestion.id, {
                                                                                matrixPromptColumns: nextPromptColumns,
                                                                                matrixRows: rows.map((row) => ({
                                                                                    ...row,
                                                                                    cells: (Array.isArray(row.cells) ? row.cells : []).filter(
                                                                                        (cell) => cell.columnId !== column.id,
                                                                                    ),
                                                                                })),
                                                                            });
                                                                        }}
                                                                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                                                    >
                                                                        Hapus
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="mb-2 flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                                                                    Kolom Jawaban
                                                                </p>
                                                                <p className="text-sm text-slate-600">
                                                                    Pilihan ini akan muncul sebagai radio button di setiap baris grid.
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const nextColumns = [
                                                                        ...answerColumns,
                                                                        {
                                                                            id: Math.random().toString(36).substr(2, 9),
                                                                            content: '',
                                                                        },
                                                                    ];
                                                                    const fallbackColumnId = nextColumns[0]?.id;
                                                                    updateQuestion(activeQuestion.id, {
                                                                        matrixColumns: nextColumns,
                                                                        matrixRows: rows.map((row) => ({
                                                                            ...row,
                                                                            correctOptionId: row.correctOptionId || fallbackColumnId,
                                                                        })),
                                                                    });
                                                                }}
                                                                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                                                            >
                                                                Tambah Kolom Jawaban
                                                            </button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {answerColumns.map((column, columnIndex) => (
                                                                <div key={column.id} className="flex items-center gap-2">
                                                                    <span className="w-8 flex-shrink-0 rounded-md border border-blue-200 bg-white px-2 py-2 text-center text-xs font-semibold text-blue-700">
                                                                        {columnIndex + 1}
                                                                    </span>
                                                                    <input
                                                                        value={column.content}
                                                                        onChange={(event) => {
                                                                            const nextColumns = answerColumns.map((item) =>
                                                                                item.id === column.id ? { ...item, content: event.target.value } : item,
                                                                            );
                                                                            updateQuestion(activeQuestion.id, {
                                                                                matrixColumns: nextColumns,
                                                                            });
                                                                        }}
                                                                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                                                                        placeholder={`Jawaban ${columnIndex + 1}`}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (answerColumns.length <= 2) {
                                                                                toast.error('Pilihan Ganda Grid minimal harus punya 2 kolom jawaban.');
                                                                                return;
                                                                            }
                                                                            const nextColumns = answerColumns.filter((item) => item.id !== column.id);
                                                                            const fallbackColumnId = nextColumns[0]?.id;
                                                                            updateQuestion(activeQuestion.id, {
                                                                                matrixColumns: nextColumns,
                                                                                matrixRows: rows.map((row) => ({
                                                                                    ...row,
                                                                                    correctOptionId:
                                                                                        row.correctOptionId === column.id
                                                                                            ? fallbackColumnId
                                                                                            : row.correctOptionId,
                                                                                })),
                                                                            });
                                                                        }}
                                                                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                                                    >
                                                                        Hapus
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="mb-2 flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                                                                    Baris Grid
                                                                </p>
                                                                <p className="text-sm text-slate-600">
                                                                    Isi setiap sel sesuai kebutuhan tabel, lalu tentukan satu kunci jawaban untuk tiap baris.
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const fallbackColumnId = answerColumns[0]?.id;
                                                                    updateQuestion(activeQuestion.id, {
                                                                        matrixRows: [
                                                                            ...rows,
                                                                            {
                                                                                id: Math.random().toString(36).substr(2, 9),
                                                                                content: '',
                                                                                cells: createMatrixRowCells(promptColumns),
                                                                                correctOptionId: fallbackColumnId,
                                                                            },
                                                                        ],
                                                                    });
                                                                }}
                                                                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                                                            >
                                                                Tambah Pernyataan
                                                            </button>
                                                        </div>
                                                        <div className="space-y-3">
                                                            {rows.map((row, rowIndex) => (
                                                                <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                                                    <div className="flex items-start gap-3">
                                                                        <span className="mt-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                                                                            {rowIndex + 1}
                                                                        </span>
                                                                        <div className="flex-1 space-y-3">
                                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                                {promptColumns.map((column, columnIndex) => {
                                                                                    const currentCell = (Array.isArray(row.cells) ? row.cells : []).find(
                                                                                        (cell) => cell.columnId === column.id,
                                                                                    );
                                                                                    return (
                                                                                        <div key={`${row.id}-${column.id}`} className="space-y-1">
                                                                                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                                                {column.label || `Kolom ${columnIndex + 1}`}
                                                                                            </label>
                                                                                            <textarea
                                                                                                rows={2}
                                                                                                value={currentCell?.content || ''}
                                                                                                onChange={(event) => {
                                                                                                    const nextValue = event.target.value;
                                                                                                    mutateQuestion(activeQuestion.id, (question) => {
                                                                                                        const nextPromptColumns = ensureMatrixPromptColumnsForEditor(question.matrixPromptColumns);
                                                                                                        const nextAnswerColumns = ensureMatrixColumnsForEditor(question.matrixColumns);
                                                                                                        const nextRows = ensureMatrixRowsForEditor(
                                                                                                            question.matrixRows,
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
                                                                                                                    content:
                                                                                                                        promptColumn.id === column.id
                                                                                                                            ? nextValue
                                                                                                                            : existingCell?.content || '',
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

                                                                                                        return {
                                                                                                            ...question,
                                                                                                            matrixRows: nextRows,
                                                                                                        };
                                                                                                    });
                                                                                                }}
                                                                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                                                                                                placeholder={`Isi ${column.label || `kolom ${columnIndex + 1}`}`}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                    <div>
                                                                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                                            Ringkasan Baris
                                                                                        </div>
                                                                                        <div className="mt-1 text-sm font-medium text-slate-700">
                                                                                            {buildMatrixRowDisplayText(row, promptColumns)}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="min-w-[220px]">
                                                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                                            Kunci Jawaban
                                                                                        </label>
                                                                                        <select
                                                                                            value={row.correctOptionId || answerColumns[0]?.id || ''}
                                                                                            onChange={(event) => {
                                                                                                const nextRows = rows.map((item) =>
                                                                                                    item.id === row.id
                                                                                                        ? { ...item, correctOptionId: event.target.value }
                                                                                                        : item,
                                                                                                );
                                                                                                updateQuestion(activeQuestion.id, {
                                                                                                    matrixRows: nextRows,
                                                                                                });
                                                                                            }}
                                                                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none"
                                                                                        >
                                                                                            {answerColumns.map((column) => (
                                                                                                <option key={column.id} value={column.id}>
                                                                                                    {column.content || 'Jawaban tanpa label'}
                                                                                                </option>
                                                                                            ))}
                                                                                        </select>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (rows.length <= 1) {
                                                                                    toast.error('Pilihan Ganda Grid minimal harus punya 1 baris.');
                                                                                    return;
                                                                                }
                                                                                updateQuestion(activeQuestion.id, {
                                                                                    matrixRows: rows.filter((item) => item.id !== row.id),
                                                                                });
                                                                            }}
                                                                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                                                        >
                                                                            Hapus
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    )}

                                    {activeQuestion.type !== 'ESSAY' && activeQuestion.type !== 'MATRIX_SINGLE_CHOICE' && (
                                        <div className="mt-4 space-y-3">
                                            {activeQuestion.options?.map((option, idx) => {
                                                const optionHistoryKey = getOptionHistoryKey(activeQuestion.id, option.id);
                                                return (
                                                <div key={option.id} className="flex gap-2 items-start group">
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

                                                    <div className="flex-1 relative group/input">
                                                        <div className="mb-1 flex items-center justify-between gap-2">
                                                            <label htmlFor={`option-content-${option.id}`} className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                                Pilihan {String.fromCharCode(65 + idx)}
                                                            </label>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => undoOptionText(option.id)}
                                                                    disabled={!canUndoOptionText(optionHistoryKey)}
                                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    <Undo2 className="h-3 w-3" />
                                                                    Undo
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => redoOptionText(option.id)}
                                                                    disabled={!canRedoOptionText(optionHistoryKey)}
                                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    <Redo2 className="h-3 w-3" />
                                                                    Redo
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <textarea
                                                            id={`option-content-${option.id}`}
                                                            name={`option_content_${option.id}`}
                                                            rows={2}
                                                            value={normalizeOptionEditorText(option.content)}
                                                            onPaste={(e) => {
                                                                const html = e.clipboardData.getData('text/html');
                                                                const rawText = e.clipboardData.getData('text/plain') || '';
                                                                const hasRtfPayload = clipboardHasRtfPayload(e.clipboardData);
                                                                const needsNormalization =
                                                                    hasRtfPayload ||
                                                                    (html && shouldNormalizeOfficePaste(html)) ||
                                                                    shouldNormalizeOfficePlainText(rawText);
                                                                const shouldSanitizePaste =
                                                                    hasRtfPayload || Boolean(html) || shouldNormalizeOfficePlainText(rawText);
                                                                if (!shouldSanitizePaste) return;

                                                                const textarea = e.currentTarget;
                                                                const plainText =
                                                                    resolveOfficeClipboardText(rawText, html) ||
                                                                    normalizeOfficePasteText(rawText || '');
                                                                if (!plainText) return;

                                                                e.preventDefault();

                                                                const start = textarea.selectionStart ?? textarea.value.length;
                                                                const end = textarea.selectionEnd ?? start;
                                                                const nextValue = `${textarea.value.slice(0, start)}${plainText}${textarea.value.slice(end)}`;
                                                                const currentValue = normalizeOptionEditorText(option.content);

                                                                if (!activeQuestion.options) return;
                                                                registerOptionTextHistoryChange(optionHistoryKey, currentValue, nextValue);
                                                                const newOptions = activeQuestion.options.map(o =>
                                                                    o.id === option.id
                                                                        ? { ...o, content: normalizeOptionStorageText(nextValue) }
                                                                        : o
                                                                );
                                                                updateQuestion(activeQuestion.id, { options: newOptions });
                                                                if (needsNormalization) {
                                                                    toast.success('Konten Word pada opsi dipaste dengan normalisasi simbol.');
                                                                }
                                                            }}
                                                            onChange={(e) => {
                                                                if (!activeQuestion.options) return;
                                                                const currentValue = normalizeOptionEditorText(option.content);
                                                                registerOptionTextHistoryChange(optionHistoryKey, currentValue, e.target.value);
                                                                const newOptions = activeQuestion.options.map(o =>
                                                                    o.id === option.id
                                                                        ? { ...o, content: normalizeOptionStorageText(e.target.value) }
                                                                        : o
                                                                );
                                                                updateQuestion(activeQuestion.id, { options: newOptions });
                                                            }}
                                                            className={`
                                                                w-full px-3 py-2 border rounded-md focus:outline-none focus:border-blue-500 text-gray-700 text-sm placeholder-gray-400 transition-all resize-y min-h-[44px]
                                                                ${option.isCorrect ? 'border-green-300 bg-green-50/10' : 'border-gray-300 bg-white'}
                                                            `}
                                                            placeholder={`Pilihan ${String.fromCharCode(65 + idx)}`}
                                                        />

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
                                            )})}
                                        </div>
                                    )}
                                </div>
                            </div>
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
            </div>

            {isInfoModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px]"
                    onClick={() => setIsInfoModalOpen(false)}
                >
                    <div
                        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Informasi Ujian</h3>
                                <p className="text-sm text-slate-500">
                                    {isCurriculumManagedPacket
                                        ? 'Judul dan instruksi masih bisa disesuaikan. Parameter lain mengikuti jadwal kurikulum.'
                                        : 'Isi judul dan parameter ujian sebelum lanjut edit butir.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsInfoModalOpen(false)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="space-y-4 px-6 py-5">
                            {isCurriculumManagedPacket ? (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                                    Paket ini dibuat dari penjadwalan kurikulum. Guru hanya dapat mengubah judul ujian dan instruksi ujian.
                                </div>
                            ) : null}
                            <input type="hidden" {...register('academicYearId', { required: 'Tahun ajaran wajib terisi' })} />
                            <input type="hidden" {...register('type')} />
                            <input type="hidden" {...register('programCode')} />

                            {isCurriculumManagedPacket ? (
                                <div className="space-y-6">
                                    <div className="space-y-2 text-[15px] leading-7 text-slate-800">
                                        {[
                                            ['Mapel Terjadwal', loadedPacket?.subject?.name || '-'],
                                            ['Tipe Ujian', examTypeDisplayLabel],
                                            ['Durasi (menit)', loadedPacket?.duration || '-'],
                                            [
                                                'Kelas/Rombel Terjadwal',
                                                curriculumScheduledClassNames.length > 0
                                                    ? curriculumScheduledClassNames.join(', ')
                                                    : 'Mengikuti jadwal kurikulum',
                                            ],
                                            ['Semester', loadedPacket?.semester === 'ODD' ? 'Ganjil' : 'Genap'],
                                            ['KKM', loadedPacket?.kkm || '-'],
                                        ].map(([label, value]) => (
                                            <div key={String(label)} className="grid grid-cols-[240px_16px_minmax(0,1fr)] gap-x-2">
                                                <span className="text-slate-800">{label}</span>
                                                <span className="text-slate-500">:</span>
                                                <span className="text-slate-900">{value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <label htmlFor="exam-title-modal" className="mb-2 block text-sm font-medium text-slate-700">
                                                Judul Ujian
                                            </label>
                                            <input
                                                id="exam-title-modal"
                                                {...register('title', { required: 'Judul wajib diisi' })}
                                                className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Masukkan judul ujian"
                                            />
                                            {errors.title && <span className="mt-1 block text-xs text-red-500">{errors.title.message}</span>}
                                        </div>

                                        <div>
                                            <label htmlFor="exam-instructions" className="mb-2 block text-sm font-medium text-slate-700">
                                                Instruksi Ujian
                                            </label>
                                            <input
                                                id="exam-instructions"
                                                {...register('instructions')}
                                                className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Instruksi / catatan untuk siswa"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="exam-title-modal" className="mb-1 block text-sm font-medium text-slate-700">
                                                Judul Ujian
                                            </label>
                                            <input
                                                id="exam-title-modal"
                                                {...register('title', { required: 'Judul wajib diisi' })}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                                placeholder="Masukkan judul ujian"
                                            />
                                            {errors.title && <span className="mt-1 block text-xs text-red-500">{errors.title.message}</span>}
                                        </div>

                                        <div>
                                            <label htmlFor="exam-subject" className="mb-1 block text-sm font-medium text-slate-700">
                                                Mapel & Kelas (Assignment)
                                            </label>
                                            <select
                                                id="exam-subject"
                                                value={selectedTeacherAssignmentId > 0 ? String(selectedTeacherAssignmentId) : ''}
                                                onChange={(event) => {
                                                    const assignment = filteredAssignmentsByProgram.find(
                                                        (item) => item.id === Number(event.target.value),
                                                    );
                                                    setValue(
                                                        'teacherAssignmentId',
                                                        assignment ? Number(assignment.id) : null,
                                                        { shouldDirty: true },
                                                    );
                                                    setValue(
                                                        'subjectId',
                                                        assignment ? Number(assignment.subject.id) : null,
                                                        { shouldDirty: true },
                                                    );
                                                    if (assignment?.kkm) {
                                                        setValue('kkm', Number(assignment.kkm), { shouldDirty: true });
                                                    }
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
                                            <input type="hidden" {...register('subjectId', { required: 'Mapel wajib dipilih' })} />
                                            <input type="hidden" {...register('teacherAssignmentId')} />
                                            {selectedProgramMeta && filteredAssignmentsByProgram.length === 0 ? (
                                              <span className="mt-1 block text-xs text-amber-600">
                                                Program ini belum memiliki assignment mapel-kelas yang diizinkan.
                                              </span>
                                            ) : null}
                                        </div>

                                        <div>
                                            <label htmlFor="exam-semester" className="mb-1 block text-sm font-medium text-slate-700">
                                                Semester
                                            </label>
                                            <select
                                                id="exam-semester"
                                                {...register('semester')}
                                                disabled={isSemesterLockedFromProgram}
                                                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${
                                                    isSemesterLockedFromProgram ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                                                }`}
                                            >
                                                <option value="ODD">Ganjil</option>
                                                <option value="EVEN">Genap</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label htmlFor="exam-type-modal" className="mb-1 block text-sm font-medium text-slate-700">
                                                Tipe Ujian
                                            </label>
                                            <input
                                                id="exam-type-modal"
                                                value={examTypeDisplayLabel}
                                                readOnly
                                                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="exam-duration" className="mb-1 block text-sm font-medium text-slate-700">
                                                Durasi (menit)
                                            </label>
                                            <input
                                                id="exam-duration"
                                                type="number"
                                                {...register('duration')}
                                                placeholder="Contoh: 90"
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="exam-published-count" className="mb-1 block text-sm font-medium text-slate-700">
                                                Soal Ditampilkan ke Siswa
                                            </label>
                                            <input
                                                id="exam-published-count"
                                                type="number"
                                                min={1}
                                                {...register('publishedQuestionCount', { valueAsNumber: true })}
                                                placeholder="Kosongkan = tampilkan semua soal"
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                Soal akan diacak per siswa dari total bank soal yang Anda buat.
                                            </p>
                                        </div>

                                        {selectedSubjectId && (
                                            <div>
                                                <label htmlFor="exam-kkm" className="mb-1 block text-sm font-medium text-slate-700">
                                                    KKM
                                                </label>
                                                <input
                                                    id="exam-kkm"
                                                    type="number"
                                                    {...register('kkm', { valueAsNumber: true })}
                                                    readOnly
                                                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label htmlFor="exam-instructions" className="mb-1 block text-sm font-medium text-slate-700">
                                            Instruksi Ujian
                                        </label>
                                        <input
                                            id="exam-instructions"
                                            {...register('instructions')}
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                            placeholder="Instruksi / catatan untuk siswa"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                <p className="text-xs font-semibold text-blue-800">Sinkronisasi Nilai</p>
                                <p className="text-xs text-blue-700">{scoreSyncCopy}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setIsInfoModalOpen(false)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                            >
                                Tutup
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveInfoModal}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                {isCurriculumManagedPacket ? 'Simpan Judul & Instruksi' : 'Simpan Informasi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {supportsQuestionSupport && isQuestionSupportModalOpen && activeQuestion ? (
                <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pb-6 pt-24">
                    <div className="flex max-h-[calc(100vh-8rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Kisi-kisi & Kartu Soal</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    Lengkapi pemetaan soal dan catatan analisis untuk soal nomor {activeQuestionIndex + 1}.
                                </p>
                                <div className="mt-3">
                                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${activeQuestionSupportMeta.badgeClassName}`}>
                                        Status kesiapan: {activeQuestionSupportMeta.label}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsQuestionSupportModalOpen(false)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                                title="Tutup"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-5">
                            <div className="space-y-5">
                                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-600">Kisi-kisi</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Lengkapi pemetaan soal agar review kurikulum dan validasi kualitas butir tetap jelas.
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${activeBlueprintSupportMeta.badgeClassName}`}>
                                            {activeBlueprintSupportMeta.label}
                                        </span>
                                    </div>

                                    {teachingResourceReferencesQuery.isFetching ? (
                                        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                                            Membaca referensi CP, ATP, Prota, dan KKTP dari perangkat ajar yang sudah dibuat.
                                        </div>
                                    ) : hasBlueprintReferenceOptions ? (
                                        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                                            Pilihan dropdown di bawah mengambil data perangkat ajar sesuai mapel dan kelas paket ujian.
                                        </div>
                                    ) : null}

                                    <div className="grid grid-cols-1 gap-3">
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                                Kompetensi/Capaian
                                            </p>
                                            {renderBlueprintReferenceSelect('competency', 'Ambil Kompetensi/CP dari perangkat ajar')}
                                            <textarea
                                                value={activeQuestionBlueprint.competency || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'competency', e.target.value)}
                                                rows={3}
                                                placeholder="Tulis kompetensi atau capaian yang menjadi dasar butir soal."
                                                className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                                Tujuan Pembelajaran
                                            </p>
                                            {renderBlueprintReferenceSelect('learningObjective', 'Ambil TP dari ATP/Prota')}
                                            <textarea
                                                value={activeQuestionBlueprint.learningObjective || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'learningObjective', e.target.value)}
                                                rows={3}
                                                placeholder="Tulis tujuan pembelajaran yang ingin dicapai."
                                                className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                                Indikator Soal
                                            </p>
                                            {renderBlueprintReferenceSelect('indicator', 'Ambil IKTP dari KKTP')}
                                            <textarea
                                                value={activeQuestionBlueprint.indicator || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'indicator', e.target.value)}
                                                rows={3}
                                                placeholder="Tulis indikator yang dipakai untuk menilai butir soal."
                                                className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                                Ruang Lingkup Materi
                                            </p>
                                            {renderBlueprintReferenceSelect('materialScope', 'Ambil materi dari ATP/CP')}
                                            <textarea
                                                value={activeQuestionBlueprint.materialScope || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'materialScope', e.target.value)}
                                                rows={3}
                                                placeholder="Tulis ruang lingkup materi yang dibahas."
                                                className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                                Level Kognitif
                                            </p>
                                            <textarea
                                                value={activeQuestionBlueprint.cognitiveLevel || ''}
                                                onChange={(e) => updateQuestionBlueprintField(activeQuestion.id, 'cognitiveLevel', e.target.value)}
                                                rows={2}
                                                placeholder="Contoh: C1-C6"
                                                className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {activeQuestionReviewFeedback?.blueprintComment ? (
                                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Catatan Kurikulum</p>
                                            <p className="mt-1">{activeQuestionReviewFeedback.blueprintComment}</p>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">Kartu Soal</p>
                                            <p className="mt-1 text-xs text-emerald-700/80">
                                                Terbentuk otomatis dari butir soal, opsi jawaban, indikator soal, dan level kognitif.
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${activeQuestionCardSupportMeta.badgeClassName}`}>
                                            {activeQuestionCardSupportMeta.label}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3">
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                                Teks Soal dan Optional
                                            </p>
                                            {renderQuestionCardStimulusPreview(activeQuestion)}
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                                Indikator Soal
                                            </p>
                                            <textarea
                                                value={activeQuestionCard.answerRationale || ''}
                                                readOnly
                                                rows={3}
                                                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                                Kunci Jawaban
                                            </p>
                                            <textarea
                                                value={activeQuestionCard.scoringGuideline || ''}
                                                readOnly
                                                rows={3}
                                                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                                Level Kognitif
                                            </p>
                                            <textarea
                                                value={activeQuestionCard.distractorNotes || ''}
                                                readOnly
                                                rows={3}
                                                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {activeQuestionReviewFeedback?.questionCardComment ? (
                                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Catatan Kurikulum</p>
                                            <p className="mt-1">{activeQuestionReviewFeedback.questionCardComment}</p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
                            <p className="text-xs text-slate-500">
                                Simpan dari sini untuk memastikan kisi-kisi dan kartu soal tidak hilang saat Anda kembali ke daftar paket.
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsQuestionSupportModalOpen(false)}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                                >
                                    Tutup
                                </button>
                                <button
                                    type="button"
                                    onClick={handleQuestionSupportSave}
                                    disabled={loading}
                                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Save className="h-4 w-4" />
                                    {loading ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {isStudentPreviewOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
                    <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Preview Sebagai Siswa</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    Tinjau tampilan paket soal persis seperti layar ujian siswa sebelum disimpan atau dipublikasikan.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsStudentPreviewOpen(false)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                                title="Tutup"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {previewQuestions.length > 0 ? (
                                <ExamStudentPreviewSurface
                                    title={(watch('title') || '').trim() || 'Judul ujian belum diisi'}
                                    subjectName={selectedSubjectName}
                                    instructions={(watch('instructions') || '').trim()}
                                    questions={previewQuestions}
                                    activeQuestionIndex={Math.max(0, activeQuestionIndex)}
                                    onActiveQuestionIndexChange={(index) => {
                                        const targetQuestion = questions[index];
                                        if (targetQuestion?.id) {
                                            setActiveQuestionId(targetQuestion.id);
                                        }
                                    }}
                                />
                            ) : (
                                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
                                    Tambahkan minimal satu soal untuk melihat preview seperti siswa.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Media Upload Modal - Only used for manual triggers if needed, but we used direct inputs now */}
            {/* Keeping it minimal or removing if unused. Based on new design, we use direct inputs/buttons. */}
            {/* However, the upload functions use `mediaTarget` state, so the direct inputs update that state and call upload immediately. */}
            <ConfirmationModal
                open={Boolean(draftRestorePrompt)}
                title="Lanjutkan Draft Ujian?"
                message="Ditemukan draft ujian yang belum tersimpan. Apakah Anda ingin melanjutkan draft tersebut?"
                confirmLabel="Ya, Lanjutkan"
                cancelLabel="Mulai Baru"
                onCancel={discardDraftFromPrompt}
                onConfirm={restoreDraftFromPrompt}
            />

            <ConfirmationModal
                open={Boolean(questionPendingDeleteId)}
                title="Hapus Soal"
                message="Apakah Anda yakin ingin menghapus soal ini dari editor ujian?"
                confirmLabel="Ya, Hapus"
                cancelLabel="Batal"
                confirmVariant="danger"
                onCancel={() => setQuestionPendingDeleteId(null)}
                onConfirm={() => {
                    if (!questionPendingDeleteId) return;
                    removeQuestion(questionPendingDeleteId);
                    setQuestionPendingDeleteId(null);
                    toast.success('Soal berhasil dihapus');
                }}
            />

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
