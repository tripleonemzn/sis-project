import type { QuestionBlueprint, QuestionCard } from '../services/exam.service';

type SupportOptionLike = {
  content?: string | null;
  image_url?: string | null;
  option_image_url?: string | null;
  isCorrect?: boolean | null;
};

type SupportQuestionLike = {
  type?: string | null;
  content?: string | null;
  question_image_url?: string | null;
  image_url?: string | null;
  question_video_url?: string | null;
  video_url?: string | null;
  options?: SupportOptionLike[] | null;
  blueprint?: QuestionBlueprint | null;
  questionCard?: QuestionCard | null;
};

export type ExamQuestionSupportStatus = 'EMPTY' | 'PARTIAL' | 'COMPLETE';

export type ExamQuestionSupportSnapshot = {
  questionStatus: ExamQuestionSupportStatus;
  blueprintStatus: ExamQuestionSupportStatus;
  questionCardStatus: ExamQuestionSupportStatus;
  overallStatus: ExamQuestionSupportStatus;
  questionReady: boolean;
  blueprintReady: boolean;
  questionCardReady: boolean;
};

const createDefaultBlueprint = (): QuestionBlueprint => ({
  competency: '',
  learningObjective: '',
  indicator: '',
  materialScope: '',
  cognitiveLevel: '',
});

const createDefaultQuestionCard = (): QuestionCard => ({
  stimulus: '',
  answerRationale: '',
  scoringGuideline: '',
  distractorNotes: '',
});

const normalizeBlueprint = (raw: QuestionBlueprint | null | undefined): QuestionBlueprint => ({
  ...createDefaultBlueprint(),
  competency: String(raw?.competency || '').trim(),
  learningObjective: String(raw?.learningObjective || '').trim(),
  indicator: String(raw?.indicator || '').trim(),
  materialScope: String(raw?.materialScope || '').trim(),
  cognitiveLevel: String(raw?.cognitiveLevel || '').trim(),
});

const normalizeQuestionCard = (raw: QuestionCard | null | undefined): QuestionCard => ({
  ...createDefaultQuestionCard(),
  stimulus: String(raw?.stimulus || '').trim(),
  answerRationale: String(raw?.answerRationale || '').trim(),
  scoringGuideline: String(raw?.scoringGuideline || '').trim(),
  distractorNotes: String(raw?.distractorNotes || '').trim(),
});

const stripHtmlText = (value: unknown): string => {
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
};

export const hasFilledSupportText = (value: unknown): boolean => stripHtmlText(value).length > 0;

const getSectionStatus = (hasAnyValue: boolean, isComplete: boolean): ExamQuestionSupportStatus => {
  if (!hasAnyValue) return 'EMPTY';
  return isComplete ? 'COMPLETE' : 'PARTIAL';
};

export const getExamQuestionSupportStatusMeta = (status: ExamQuestionSupportStatus) => {
  if (status === 'COMPLETE') {
    return {
      label: 'Selesai',
      badgeClassName: 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200',
      buttonClassName: 'border-emerald-300 bg-emerald-50 text-emerald-700',
      summaryCardClassName: 'border-emerald-200 bg-emerald-50/80',
      summaryValueClassName: 'text-emerald-700',
    };
  }

  if (status === 'PARTIAL') {
    return {
      label: 'Belum selesai',
      badgeClassName: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200 motion-safe:animate-pulse',
      buttonClassName: 'border-amber-300 bg-amber-50 text-amber-700 motion-safe:animate-pulse',
      summaryCardClassName: 'border-amber-200 bg-amber-50/80 motion-safe:animate-pulse',
      summaryValueClassName: 'text-amber-700',
    };
  }

  return {
    label: 'Belum dibuat',
    badgeClassName: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200 motion-safe:animate-pulse',
    buttonClassName: 'border-rose-300 bg-rose-50 text-rose-700 motion-safe:animate-pulse',
    summaryCardClassName: 'border-rose-200 bg-rose-50/80 motion-safe:animate-pulse',
    summaryValueClassName: 'text-rose-700',
  };
};

export const getExamQuestionSupportSnapshot = (
  question?: SupportQuestionLike | null,
): ExamQuestionSupportSnapshot => {
  if (!question) {
    return {
      questionStatus: 'EMPTY',
      blueprintStatus: 'EMPTY',
      questionCardStatus: 'EMPTY',
      overallStatus: 'EMPTY',
      questionReady: false,
      blueprintReady: false,
      questionCardReady: false,
    };
  }

  const blueprint = normalizeBlueprint(question.blueprint);
  const questionCard = normalizeQuestionCard(question.questionCard);
  const options = Array.isArray(question.options) ? question.options : [];
  const nonEmptyOptions = options.filter(
    (option) =>
      hasFilledSupportText(option.content) ||
      hasFilledSupportText(option.image_url) ||
      hasFilledSupportText(option.option_image_url),
  );
  const hasQuestionPrompt =
    hasFilledSupportText(question.content) ||
    hasFilledSupportText(question.question_image_url) ||
    hasFilledSupportText(question.image_url) ||
    hasFilledSupportText(question.question_video_url) ||
    hasFilledSupportText(question.video_url);
  const hasCorrectMetadata = options.some((option) => typeof option.isCorrect === 'boolean');
  const hasCorrectAnswer = hasCorrectMetadata ? options.some((option) => option.isCorrect) : true;
  const normalizedType = String(question.type || '').trim().toUpperCase();
  const questionReady =
    normalizedType === 'ESSAY'
      ? hasQuestionPrompt
      : hasQuestionPrompt && nonEmptyOptions.length > 0 && hasCorrectAnswer;
  const questionTouched =
    hasQuestionPrompt ||
    nonEmptyOptions.length > 0 ||
    (hasCorrectMetadata && options.some((option) => option.isCorrect));

  const blueprintTouched =
    hasFilledSupportText(blueprint.competency) ||
    hasFilledSupportText(blueprint.learningObjective) ||
    hasFilledSupportText(blueprint.indicator) ||
    hasFilledSupportText(blueprint.materialScope) ||
    hasFilledSupportText(blueprint.cognitiveLevel);
  const blueprintReady =
    hasFilledSupportText(blueprint.competency) &&
    hasFilledSupportText(blueprint.learningObjective) &&
    hasFilledSupportText(blueprint.indicator) &&
    hasFilledSupportText(blueprint.materialScope) &&
    hasFilledSupportText(blueprint.cognitiveLevel);

  const questionCardTouched =
    hasFilledSupportText(questionCard.stimulus) ||
    hasFilledSupportText(questionCard.answerRationale) ||
    hasFilledSupportText(questionCard.scoringGuideline) ||
    hasFilledSupportText(questionCard.distractorNotes);
  const questionCardReady =
    hasFilledSupportText(questionCard.stimulus) &&
    hasFilledSupportText(questionCard.answerRationale) &&
    hasFilledSupportText(questionCard.scoringGuideline) &&
    hasFilledSupportText(questionCard.distractorNotes);

  const questionStatus = getSectionStatus(questionTouched, questionReady);
  const blueprintStatus = getSectionStatus(blueprintTouched, blueprintReady);
  const questionCardStatus = getSectionStatus(questionCardTouched, questionCardReady);

  const overallStatus =
    questionStatus === 'EMPTY' && blueprintStatus === 'EMPTY' && questionCardStatus === 'EMPTY'
      ? 'EMPTY'
      : questionReady && blueprintReady && questionCardReady
        ? 'COMPLETE'
        : 'PARTIAL';

  return {
    questionStatus,
    blueprintStatus,
    questionCardStatus,
    overallStatus,
    questionReady,
    blueprintReady,
    questionCardReady,
  };
};
