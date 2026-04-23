import fs from 'fs/promises';
import path from 'path';

const QUESTION_IMAGE_URL_PREFIX = '/api/uploads/questions/images/';
const QUESTION_IMAGE_UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/questions/images');
const MEDIA_AUDIT_CACHE_TTL_MS = 2 * 60 * 1000;
const MEDIA_AUDIT_CACHE_MAX_SIZE = 200;

export type ExamPacketMediaAuditIssue = {
    questionId: string;
    questionNumber: number;
    locationLabel: string;
    sourceUrl: string;
    missingOriginal: boolean;
    missingThumbnail: boolean;
};

export type ExamPacketMediaAuditStatus = 'OK' | 'WARNING' | 'BLOCKED';

export type ExamPacketMediaAudit = {
    status: ExamPacketMediaAuditStatus;
    checkedAt: string;
    scannedQuestionCount: number;
    referencedMediaCount: number;
    issueCount: number;
    missingOriginalCount: number;
    missingThumbnailCount: number;
    issues: ExamPacketMediaAuditIssue[];
};

type PacketMediaReference = {
    questionId: string;
    questionNumber: number;
    locationLabel: string;
    sourceUrl: string;
};

type PacketMediaAuditCacheEntry = {
    expiresAt: number;
    value: ExamPacketMediaAudit;
};

type AuditQuestionLike = {
    id?: string | null;
    content?: string | null;
    question_image_url?: string | null;
    image_url?: string | null;
    options?: unknown[] | null;
};

const mediaAuditCache = new Map<number, PacketMediaAuditCacheEntry>();

function cloneAuditIssue(issue: ExamPacketMediaAuditIssue): ExamPacketMediaAuditIssue {
    return { ...issue };
}

function cloneAudit(audit: ExamPacketMediaAudit): ExamPacketMediaAudit {
    return {
        ...audit,
        issues: audit.issues.map(cloneAuditIssue),
    };
}

function trimMediaAuditCache() {
    while (mediaAuditCache.size > MEDIA_AUDIT_CACHE_MAX_SIZE) {
        const firstKey = mediaAuditCache.keys().next().value;
        if (typeof firstKey !== 'number') break;
        mediaAuditCache.delete(firstKey);
    }
}

function extractInlineImageSources(html: string | null | undefined): string[] {
    const rawHtml = String(html || '');
    if (!rawHtml || !/<img\b/i.test(rawHtml)) return [];

    const sources: string[] = [];
    rawHtml.replace(/<img\b[^>]*\ssrc\s*=\s*(['"])(.*?)\1/gi, (_full, _quote: string, source: string) => {
        const normalized = String(source || '').trim();
        if (normalized) {
            sources.push(normalized);
        }
        return _full;
    });
    return sources;
}

function getQuestionOptionLabel(index: number): string {
    const normalizedIndex = Math.max(0, Number(index) || 0);
    return String.fromCharCode(65 + (normalizedIndex % 26));
}

function resolveInternalQuestionImageFilename(rawUrl: string | null | undefined): string | null {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl || /^data:/i.test(normalizedUrl) || /^blob:/i.test(normalizedUrl)) return null;

    let pathname = normalizedUrl;
    try {
        pathname = new URL(normalizedUrl, 'https://audit.local').pathname || '';
    } catch {
        pathname = normalizedUrl.split(/[?#]/, 1)[0] || normalizedUrl;
    }

    if (!pathname.startsWith(QUESTION_IMAGE_URL_PREFIX)) return null;
    const candidate = decodeURIComponent(pathname.slice(QUESTION_IMAGE_URL_PREFIX.length)).replace(/^\/+/, '').trim();
    if (!candidate) return null;
    if (candidate.includes('/') || candidate.includes('\\') || candidate.includes('..')) return null;
    return candidate;
}

function buildThumbnailPathFromOriginal(originalPath: string): string {
    const extension = path.extname(originalPath);
    const basename = extension ? originalPath.slice(0, -extension.length) : originalPath;
    return `${basename}.thumb.webp`;
}

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function collectPacketMediaReferences(questions: AuditQuestionLike[]): PacketMediaReference[] {
    const references: PacketMediaReference[] = [];

    questions.forEach((question, index) => {
        const questionNumber = index + 1;
        const questionId = String(question.id || `q-${questionNumber}`);
        const directQuestionImage = String(question.question_image_url || question.image_url || '').trim();
        if (directQuestionImage) {
            references.push({
                questionId,
                questionNumber,
                locationLabel: 'Media soal',
                sourceUrl: directQuestionImage,
            });
        }

        extractInlineImageSources(question.content).forEach((sourceUrl, imageIndex) => {
            references.push({
                questionId,
                questionNumber,
                locationLabel:
                    imageIndex === 0
                        ? 'Gambar tertanam di teks soal'
                        : `Gambar tertanam di teks soal #${imageIndex + 1}`,
                sourceUrl,
            });
        });

        (Array.isArray(question.options) ? question.options : []).forEach((option, optionIndex) => {
            const normalizedOption =
                option && typeof option === 'object' && !Array.isArray(option)
                    ? (option as {
                          content?: string | null;
                          image_url?: string | null;
                          option_image_url?: string | null;
                      })
                    : {};
            const optionLabel = getQuestionOptionLabel(optionIndex);
            const directOptionImage = String(normalizedOption.image_url || normalizedOption.option_image_url || '').trim();
            if (directOptionImage) {
                references.push({
                    questionId,
                    questionNumber,
                    locationLabel: `Media opsi ${optionLabel}`,
                    sourceUrl: directOptionImage,
                });
            }

            extractInlineImageSources(normalizedOption.content).forEach((sourceUrl, imageIndex) => {
                references.push({
                    questionId,
                    questionNumber,
                    locationLabel:
                        imageIndex === 0
                            ? `Gambar tertanam di opsi ${optionLabel}`
                            : `Gambar tertanam di opsi ${optionLabel} #${imageIndex + 1}`,
                    sourceUrl,
                });
            });
        });
    });

    return references;
}

export function invalidateExamPacketMediaAuditCache(packetId?: number) {
    if (!Number.isFinite(Number(packetId)) || Number(packetId) <= 0) return;
    mediaAuditCache.delete(Number(packetId));
}

export async function auditExamPacketMedia(params: {
    packetId?: number | null;
    questions?: AuditQuestionLike[] | null;
}): Promise<ExamPacketMediaAudit> {
    const packetId = Number(params.packetId || 0);
    const now = Date.now();

    if (packetId > 0) {
        const cached = mediaAuditCache.get(packetId);
        if (cached && cached.expiresAt > now) {
            return cloneAudit(cached.value);
        }
        if (cached) {
            mediaAuditCache.delete(packetId);
        }
    }

    const questions = Array.isArray(params.questions) ? params.questions : [];
    const references = collectPacketMediaReferences(questions);
    const fileExistsCache = new Map<string, boolean>();
    const issues: ExamPacketMediaAuditIssue[] = [];

    let missingOriginalCount = 0;
    let missingThumbnailCount = 0;

    for (const reference of references) {
        const filename = resolveInternalQuestionImageFilename(reference.sourceUrl);
        if (!filename) continue;

        const originalPath = path.join(QUESTION_IMAGE_UPLOAD_DIR, filename);
        const thumbnailPath = buildThumbnailPathFromOriginal(originalPath);

        let originalExists = fileExistsCache.get(originalPath);
        if (originalExists === undefined) {
            originalExists = await pathExists(originalPath);
            fileExistsCache.set(originalPath, originalExists);
        }

        let thumbnailExists = fileExistsCache.get(thumbnailPath);
        if (thumbnailExists === undefined) {
            thumbnailExists = await pathExists(thumbnailPath);
            fileExistsCache.set(thumbnailPath, thumbnailExists);
        }

        const missingOriginal = !originalExists;
        const missingThumbnail = originalExists && !thumbnailExists;
        if (!missingOriginal && !missingThumbnail) continue;

        if (missingOriginal) {
            missingOriginalCount += 1;
        }
        if (missingThumbnail) {
            missingThumbnailCount += 1;
        }

        issues.push({
            questionId: reference.questionId,
            questionNumber: reference.questionNumber,
            locationLabel: reference.locationLabel,
            sourceUrl: reference.sourceUrl,
            missingOriginal,
            missingThumbnail,
        });
    }

    const status: ExamPacketMediaAuditStatus =
        missingOriginalCount > 0 ? 'BLOCKED' : missingThumbnailCount > 0 ? 'WARNING' : 'OK';

    const audit: ExamPacketMediaAudit = {
        status,
        checkedAt: new Date().toISOString(),
        scannedQuestionCount: questions.length,
        referencedMediaCount: references.length,
        issueCount: issues.length,
        missingOriginalCount,
        missingThumbnailCount,
        issues,
    };

    if (packetId > 0) {
        mediaAuditCache.set(packetId, {
            expiresAt: now + MEDIA_AUDIT_CACHE_TTL_MS,
            value: cloneAudit(audit),
        });
        trimMediaAuditCache();
    }

    return audit;
}
