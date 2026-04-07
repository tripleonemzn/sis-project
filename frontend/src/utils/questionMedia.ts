import katex from 'katex';

type EnhanceHtmlOptions = {
  useQuestionImageThumbnail?: boolean;
};

const QUESTION_IMAGE_PATH_REGEX = /\/api\/uploads\/questions\/images\/([^/?#]+)/i;

function isGifSource(url: string | null | undefined): boolean {
  return /\.gif(?:[?#].*)?$/i.test(String(url || '').trim());
}

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

  // Keep GIF source as-is so animated images stay animated on exam screen.
  if (isGifSource(pathPart)) return normalized;

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
  if (isGifSource(originalSrc)) return attrs;
  const thumbnailSrc = buildQuestionImageThumbnailUrl(originalSrc);
  if (!thumbnailSrc || thumbnailSrc === originalSrc) return attrs;

  return attrs.replace(srcRegex, ` src="${thumbnailSrc}"`);
}

function normalizeOfficeHtml(html: string): string {
  return String(html || '')
    .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, '')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<\/?o:p\b[^>]*>/gi, '')
    .replace(/\sclass=(['"])[^'"]*\bMso[a-zA-Z0-9_-]*[^'"]*\1/gi, '')
    .replace(/\sstyle=(['"])(.*?)\1/gi, (_full, quote: string, styleValue: string) => {
      const cleanedStyle = String(styleValue || '')
        .replace(/(^|;)\s*mso-[^:;]+:[^;]+/gi, '')
        .replace(/(^|;)\s*tab-stops:[^;]+/gi, '')
        .replace(/(^|;)\s*layout-grid-mode:[^;]+/gi, '')
        .replace(/(^|;)\s*white-space:[^;]+/gi, '')
        .replace(/(^|;)\s*word-break:[^;]+/gi, '')
        .replace(/(^|;)\s*word-wrap:[^;]+/gi, '')
        .replace(/(^|;)\s*overflow-wrap:[^;]+/gi, '')
        .replace(/;;+/g, ';')
        .replace(/^;|;$/g, '')
        .trim();
      return cleanedStyle ? ` style=${quote}${cleanedStyle}${quote}` : '';
    })
    .replace(
      /<(p|div)\b([^>]*)>\s*(?:<br\s*\/?>|\s|&nbsp;|\u00a0)*<\/\1>/gi,
      (_full, tagName: string, attrs: string) => `<${tagName}${attrs}>&nbsp;</${tagName}>`,
    )
    .replace(/<table\b[^>]*>/gi, '<div class="exam-office-table">')
    .replace(/<\/table>/gi, '</div>')
    .replace(/<tr\b[^>]*>/gi, '<div class="exam-office-row">')
    .replace(/<\/tr>/gi, '</div>')
    .replace(/<t[dh]\b[^>]*>/gi, '<span class="exam-office-cell">')
    .replace(/<\/t[dh]>/gi, '</span> ')
    .trim();
}

function renderFormulaEmbeds(html: string): string {
  return String(html || '').replace(
    /<span\b([^>]*class=(['"])[^'"]*\bql-formula\b[^'"]*\2[^>]*)data-value=(['"])(.*?)\3([^>]*)>(.*?)<\/span>/gi,
    (_full, _beforeClassAttrs: string, _quote: string, _dataQuote: string, rawLatex: string) => {
      const latex = String(rawLatex || '')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .trim();

      if (!latex) return '';

      try {
        return katex.renderToString(latex, {
          throwOnError: false,
          strict: 'ignore',
          output: 'htmlAndMathml',
        });
      } catch {
        return `<code class="exam-formula-fallback">${latex}</code>`;
      }
    },
  );
}

export function enhanceQuestionHtml(rawHtml: string | null | undefined, options: EnhanceHtmlOptions = {}): string {
  const normalizedHtml = renderFormulaEmbeds(normalizeOfficeHtml(String(rawHtml || '')));
  if (!normalizedHtml) return normalizedHtml;

  if (!/<img\b/i.test(normalizedHtml)) return normalizedHtml;

  return normalizedHtml.replace(/<img\b([^>]*)>/gi, (_fullTag, rawAttrs: string) => {
    let attrs = String(rawAttrs || '');
    const srcMatch = attrs.match(/\ssrc\s*=\s*(['"])(.*?)\1/i);
    const sourceUrl = srcMatch ? String(srcMatch[2] || '') : '';
    const gifSource = isGifSource(sourceUrl);
    if (gifSource) {
      attrs = ensureAttr(attrs, 'loading', 'eager');
      attrs = ensureAttr(attrs, 'decoding', 'sync');
    } else {
      attrs = ensureAttr(attrs, 'loading', 'lazy');
      attrs = ensureAttr(attrs, 'decoding', 'async');
      if (options.useQuestionImageThumbnail) {
        attrs = maybeSwapImageSource(attrs);
      }
    }
    attrs = appendInlineStyle(attrs);

    return `<img${attrs}>`;
  });
}
