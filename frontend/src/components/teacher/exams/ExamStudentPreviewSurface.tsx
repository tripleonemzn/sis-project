import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Send,
} from 'lucide-react';
import { QuestionMediaImage } from '../../common/QuestionMediaImage';
import { enhanceQuestionHtml } from '../../../utils/questionMedia';

export type ExamStudentPreviewOption = {
  id: string;
  content: string;
  image_url?: string | null;
  option_image_url?: string | null;
};

export type ExamStudentPreviewQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'COMPLEX_MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'ESSAY' | 'MATCHING';
  content: string;
  question_image_url?: string | null;
  image_url?: string | null;
  question_video_url?: string | null;
  video_url?: string | null;
  question_video_type?: 'upload' | 'youtube' | null;
  question_media_position?: 'top' | 'bottom' | 'left' | 'right' | string | null;
  options?: ExamStudentPreviewOption[];
};

type PreviewAnswerValue = string | string[] | null;

type ExamStudentPreviewSurfaceProps = {
  title: string;
  subjectName: string;
  instructions?: string | null;
  questions: ExamStudentPreviewQuestion[];
  activeQuestionIndex: number;
  onActiveQuestionIndexChange: (index: number) => void;
  className?: string;
};

function hasAnsweredValue(value: PreviewAnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0;
}

export function ExamStudentPreviewSurface({
  title,
  subjectName,
  instructions,
  questions,
  activeQuestionIndex,
  onActiveQuestionIndexChange,
  className = '',
}: ExamStudentPreviewSurfaceProps) {
  const [answers, setAnswers] = useState<Record<string, PreviewAnswerValue>>({});
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

  const totalQuestions = questions.length;
  const safeActiveQuestionIndex =
    activeQuestionIndex >= 0 && activeQuestionIndex < totalQuestions ? activeQuestionIndex : 0;
  const currentQuestion = questions[safeActiveQuestionIndex] || null;
  const answeredCount = useMemo(
    () =>
      questions.reduce((count, question) => {
        return count + (hasAnsweredValue(answers[question.id]) ? 1 : 0);
      }, 0),
    [answers, questions],
  );

  const currentQuestionHtml = useMemo(
    () => enhanceQuestionHtml(currentQuestion?.content || '', { useQuestionImageThumbnail: false }),
    [currentQuestion?.content],
  );

  const optionHtmlById = useMemo(() => {
    const map = new Map<string, string>();
    (currentQuestion?.options || []).forEach((option) => {
      map.set(
        String(option.id || ''),
        enhanceQuestionHtml(option.content || '', { useQuestionImageThumbnail: false }),
      );
    });
    return map;
  }, [currentQuestion?.options]);

  const handleAnswerChange = (questionId: string, optionId: string, multiple: boolean) => {
    setAnswers((prev) => {
      if (!multiple) {
        return {
          ...prev,
          [questionId]: optionId,
        };
      }

      const current = Array.isArray(prev[questionId]) ? [...(prev[questionId] as string[])] : [];
      const exists = current.includes(optionId);
      return {
        ...prev,
        [questionId]: exists ? current.filter((item) => item !== optionId) : [...current, optionId],
      };
    });
  };

  const mediaSection =
    currentQuestion &&
    ((currentQuestion.question_image_url || currentQuestion.image_url) ||
      (currentQuestion.question_video_url || currentQuestion.video_url)) ? (
      <div className="space-y-4">
        {(currentQuestion.question_image_url || currentQuestion.image_url) && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() =>
                setPreviewImageSrc(currentQuestion.question_image_url || currentQuestion.image_url || '')
              }
              className="inline-flex focus:outline-none"
            >
              <QuestionMediaImage
                src={currentQuestion.question_image_url || currentQuestion.image_url || ''}
                alt="Media soal"
                preferThumbnail={false}
                className="max-h-[320px] max-w-full rounded-2xl border border-slate-200 bg-white object-contain shadow-sm"
              />
            </button>
          </div>
        )}

        {(currentQuestion.question_video_url || currentQuestion.video_url) && (
          <div className="mx-auto max-w-3xl">
            {(currentQuestion.question_video_url || currentQuestion.video_url || '').includes('youtube') ? (
              <div className="aspect-video overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                <iframe
                  src={currentQuestion.question_video_url || currentQuestion.video_url || ''}
                  className="h-full w-full"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  title="Video soal"
                />
              </div>
            ) : (
              <video
                src={currentQuestion.question_video_url || currentQuestion.video_url || ''}
                controls
                preload="metadata"
                className="max-h-[320px] w-full rounded-2xl border border-slate-200 shadow-sm"
              />
            )}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className={`rounded-[28px] border border-slate-200 bg-slate-50 shadow-sm ${className}`}>
      <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600">
              Pratinjau Sebagai Siswa
            </p>
            <h3 className="truncate text-lg font-bold text-slate-900">{title || 'Judul ujian belum diisi'}</h3>
            <p className="truncate text-sm text-slate-600">{subjectName || 'Mata pelajaran'}</p>
            {instructions ? (
              <p className="mt-1 line-clamp-2 text-xs text-orange-700">{instructions}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-emerald-700">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-semibold">90:00</span>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
            >
              <Send className="h-4 w-4" />
              Kumpulkan
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:p-6">
        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Progres: <span className="font-semibold">{answeredCount}/{totalQuestions}</span> soal terisi
              </div>
              <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                Soal No. {safeActiveQuestionIndex + 1}
              </span>
            </div>

            {(!currentQuestion?.question_media_position || currentQuestion?.question_media_position === 'top') &&
              mediaSection}

            <div
              className="prose mb-6 max-w-none text-base text-slate-800 [&_*]:max-w-full [&_*]:break-normal [&_*]:!whitespace-normal [&_div]:my-3 [&_div]:text-justify [&_li]:my-1 [&_li]:text-justify [&_ol]:ml-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p]:text-justify [&_ul]:ml-2 [&_ul]:list-disc [&_ul]:pl-6"
              style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
              dangerouslySetInnerHTML={{ __html: currentQuestionHtml }}
            />

            {currentQuestion?.question_media_position === 'bottom' && mediaSection}

            {currentQuestion?.type !== 'ESSAY' ? (
              <div className="space-y-3">
                {(currentQuestion?.options || []).map((option) => {
                  const optionId = String(option.id || '');
                  const isMultiple = currentQuestion?.type === 'COMPLEX_MULTIPLE_CHOICE';
                  const isSelected = isMultiple
                    ? (answers[currentQuestion.id] as string[] | undefined)?.includes(optionId)
                    : String(answers[currentQuestion.id] || '') === optionId;
                  const optionImageSrc =
                    typeof option.option_image_url === 'string'
                      ? option.option_image_url
                      : typeof option.image_url === 'string'
                        ? option.image_url
                        : '';

                  return (
                    <label
                      key={optionId}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${
                        isSelected ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type={isMultiple ? 'checkbox' : 'radio'}
                        name={`preview-question-${currentQuestion?.id}`}
                        checked={isSelected}
                        onChange={() => handleAnswerChange(String(currentQuestion?.id || ''), optionId, isMultiple)}
                        className={`mt-1 h-5 w-5 border-slate-300 text-blue-600 ${isMultiple ? 'rounded' : ''}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-sm text-slate-700 [&_ol]:ml-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:ml-2 [&_ul]:list-disc [&_ul]:pl-6"
                          style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                          dangerouslySetInnerHTML={{ __html: optionHtmlById.get(optionId) || '' }}
                        />
                        {optionImageSrc ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImageSrc(optionImageSrc)}
                            className="mt-3 inline-flex rounded-xl border border-blue-200 p-1"
                          >
                            <QuestionMediaImage
                              src={optionImageSrc}
                              alt="Opsi"
                              preferThumbnail={false}
                              className="max-h-28 rounded-lg object-contain"
                            />
                          </button>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea
                rows={6}
                value={typeof answers[currentQuestion?.id || ''] === 'string' ? String(answers[currentQuestion?.id || '']) : ''}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [String(currentQuestion?.id || '')]: event.target.value,
                  }))
                }
                placeholder="Tulis jawaban Anda di sini..."
                className="h-44 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onActiveQuestionIndexChange(Math.max(0, safeActiveQuestionIndex - 1))}
              disabled={safeActiveQuestionIndex === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => onActiveQuestionIndexChange(Math.min(totalQuestions - 1, safeActiveQuestionIndex + 1))}
              disabled={safeActiveQuestionIndex >= totalQuestions - 1}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Selanjutnya
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Navigasi Soal</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((question, index) => {
                const isActive = index === safeActiveQuestionIndex;
                const isAnswered = hasAnsweredValue(answers[question.id]);
                return (
                  <button
                    key={question.id || `preview-question-${index + 1}`}
                    type="button"
                    onClick={() => onActiveQuestionIndexChange(index)}
                    className={`inline-flex h-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : isAnswered
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {previewImageSrc ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-6"
          onClick={() => setPreviewImageSrc(null)}
        >
          <img
            src={previewImageSrc}
            alt="Preview soal"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/20 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
