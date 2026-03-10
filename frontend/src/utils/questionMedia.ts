type EnhanceHtmlOptions = {
  useQuestionImageThumbnail?: boolean;
};

const QUESTION_IMAGE_PATH_REGEX = /\/api\/uploads\/questions\/images\/([^/?#]+)/i;

function splitUrlSuffix(url: string): { pathPart: string; suffix: string } {
  const match = String(url).match(/^([^?#]*)(.*)$/);
  if (!match) return { pathPart: String(url), suffix: '' };
  return {
    pathPart: match[1] || '',
    suffix: match[2] || '',
  };
}

export function buildQuestionImageThumbnailUrl(url: string | null | undefined): string {
  const normalized = String(url || '').trim();
  if (!normalized) return '';

  const { pathPart, suffix } = splitUrlSuffix(normalized);
  if (!QUESTION_IMAGE_PATH_REGEX.test(pathPart)) return normalized;

  const thumbPath = pathPart.replace(/(\.[a-z0-9]+)$/i, '.thumb.webp');
  if (thumbPath === pathPart) {
    return `${pathPart}.thumb.webp${suffix}`;
  }

  return `${thumbPath}${suffix}`;
}

function appendInlineStyle(attrs: string): string {
  if (!/\sstyle\s*=/i.test(attrs)) {
    return `${attrs} style="max-width:100%;height:auto"`;
  }

  return attrs.replace(/\sstyle\s*=\s*(['"])(.*?)\1/i, (_full, quote: string, styleValue: string) => {
    const current = String(styleValue || '').trim();
    const withMaxWidth = /max-width\s*:/i.test(current) ? current : `${current}${current ? ';' : ''}max-width:100%`;
    const withHeight = /height\s*:/i.test(withMaxWidth) ? withMaxWidth : `${withMaxWidth};height:auto`;
    return ` style=${quote}${withHeight}${quote}`;
  });
}

function ensureAttr(attrs: string, attrName: string, attrValue: string): string {
  const regex = new RegExp(`\\s${attrName}\\s*=`, 'i');
  if (regex.test(attrs)) return attrs;
  return `${attrs} ${attrName}="${attrValue}"`;
}

function maybeSwapImageSource(attrs: string): string {
  const srcRegex = /\ssrc\s*=\s*(['"])(.*?)\1/i;
  const match = attrs.match(srcRegex);
  if (!match) return attrs;

  const originalSrc = String(match[2] || '');
  const thumbnailSrc = buildQuestionImageThumbnailUrl(originalSrc);
  if (!thumbnailSrc || thumbnailSrc === originalSrc) return attrs;

  return attrs.replace(srcRegex, ` src="${thumbnailSrc}"`);
}

export function enhanceQuestionHtml(rawHtml: string | null | undefined, options: EnhanceHtmlOptions = {}): string {
  const html = String(rawHtml || '');
  if (!html || !/<img\b/i.test(html)) return html;

  return html.replace(/<img\b([^>]*)>/gi, (_fullTag, rawAttrs: string) => {
    let attrs = String(rawAttrs || '');
    attrs = ensureAttr(attrs, 'loading', 'lazy');
    attrs = ensureAttr(attrs, 'decoding', 'async');
    attrs = appendInlineStyle(attrs);

    if (options.useQuestionImageThumbnail) {
      attrs = maybeSwapImageSource(attrs);
    }

    return `<img${attrs}>`;
  });
}

