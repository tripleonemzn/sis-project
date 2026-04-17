import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { ENV } from '../config/env';
import { useAppTextScale } from '../theme/AppTextScaleProvider';

type ExamHtmlContentProps = {
  html?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoType?: 'upload' | 'youtube' | null;
  interactive?: boolean;
  minHeight?: number;
  backgroundColor?: string;
  onImagePress?: (src: string) => void;
  showInlineVideo?: boolean;
  renderMode?: 'webview' | 'native';
  textAlign?: 'left' | 'justify';
};

function toMediaUrl(url?: string | null) {
  const normalized = String(url || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const base = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return normalized.startsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeSimpleEntities(value: string) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_full, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _full;
    })
    .replace(/&#([0-9]+);/g, (_full, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _full;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function extractQuillDeltaHtml(raw: string) {
  const normalized = String(raw || '').trim();
  if (!normalized.startsWith('{') && !normalized.startsWith('[')) return null;

  try {
    const parsed = JSON.parse(normalized) as
      | { ops?: Array<{ insert?: string | { image?: string } }> }
      | Array<{ insert?: string | { image?: string } }>;
    const ops = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.ops) ? parsed.ops : [];
    if (!ops.length) return null;

    const fragments = ops
      .map((op) => {
        if (typeof op?.insert === 'string') {
          return escapeHtml(op.insert)
            .replace(/\r\n?/g, '\n')
            .replace(/\n{2,}/g, '\n\n')
            .replace(/\n/g, '<br />');
        }
        const imageUrl = typeof op?.insert === 'object' ? String(op.insert?.image || '').trim() : '';
        if (imageUrl) {
          return `<img class="question-media" src="${escapeHtml(toMediaUrl(imageUrl))}" alt="Media soal" />`;
        }
        return '';
      })
      .filter((item) => item.length > 0);

    if (!fragments.length) return null;
    return fragments.join('');
  } catch {
    return null;
  }
}

export function normalizeExamRichTextToHtml(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '<p>-</p>';
  const normalizedRaw = raw
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;(?=(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&');
  const deltaHtml = extractQuillDeltaHtml(normalizedRaw);
  if (deltaHtml) return deltaHtml;

  const cleaned = normalizedRaw
    .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, '')
    .replace(/<\/?o:p\b[^>]*>/gi, '')
    .replace(/\sclass=(['"])[^'"]*\bMso[a-zA-Z0-9_-]*[^'"]*\1/gi, '')
    .replace(/\sstyle=(['"])(.*?)\1/gi, (_full, quote: string, styleValue: string) => {
      const nextStyle = String(styleValue || '')
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
      return nextStyle ? ` style=${quote}${nextStyle}${quote}` : '';
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
    .replace(
      /<span\b([^>]*class=(['"])[^'"]*\bql-formula\b[^'"]*\2[^>]*)data-value=(['"])(.*?)\3([^>]*)>(.*?)<\/span>/gi,
      (_full, _beforeAttrs: string, _quote: string, _dataQuote: string, rawLatex: string) => {
        const latex = String(rawLatex || '')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&amp;/gi, '&')
          .trim();
        return latex ? `<code class="exam-formula-fallback">${escapeHtml(latex)}</code>` : '';
      },
    )
    .trim();
  const decoded = decodeSimpleEntities(cleaned);

  if (/<[a-z][\s\S]*>/i.test(decoded)) return decoded;

  return escapeHtml(decoded)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/\n/g, '<br />');
}

export function plainTextFromExamRichText(value?: string | null) {
  return decodeSimpleEntities(normalizeExamRichTextToHtml(value))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function plainTextBlocksFromExamRichText(value?: string | null) {
  return decodeSimpleEntities(
    normalizeExamRichTextToHtml(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|ol|ul|table)>/gi, '\n')
      .replace(/<(li)\b[^>]*>/gi, '• ')
      .replace(/<(img|iframe|video)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getYoutubeEmbedUrl(url?: string | null) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/\//g, '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === 'embed' || part === 'shorts');
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIndex + 1]}`;
      }
    }
  } catch {
    return '';
  }

  return '';
}

export function ExamHtmlContent({
  html,
  imageUrl,
  videoUrl,
  videoType,
  interactive = false,
  minHeight = 120,
  backgroundColor = '#ffffff',
  onImagePress,
  showInlineVideo = true,
  renderMode = 'webview',
  textAlign = 'left',
}: ExamHtmlContentProps) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const safeMinHeight = Number.isFinite(minHeight) ? Math.max(24, Math.floor(minHeight)) : 120;
  const [height, setHeight] = useState(safeMinHeight);
  const [nativeImageSize, setNativeImageSize] = useState<{ width: number; height: number } | null>(null);
  const { width: viewportWidth } = useWindowDimensions();
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  const resolvedNativeImageUrl = useMemo(() => toMediaUrl(imageUrl), [imageUrl]);
  const nativeTextContent = useMemo(() => plainTextBlocksFromExamRichText(html), [html]);

  useEffect(() => {
    let isActive = true;
    if (!resolvedNativeImageUrl) {
      setNativeImageSize(null);
      return () => {
        isActive = false;
      };
    }

    Image.getSize(
      resolvedNativeImageUrl,
      (width, height) => {
        if (!isActive) return;
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          setNativeImageSize({ width, height });
        } else {
          setNativeImageSize(null);
        }
      },
      () => {
        if (isActive) setNativeImageSize(null);
      },
    );

    return () => {
      isActive = false;
    };
  }, [resolvedNativeImageUrl]);

  const nativeImageFrame = useMemo(() => {
    if (!nativeImageSize) return null;
    const maxWidth = Math.max(180, Math.min(viewportWidth - 72, 520));
    const maxHeight = 360;
    const scale = Math.min(maxWidth / nativeImageSize.width, maxHeight / nativeImageSize.height, 1);
    const width = Math.max(96, Math.round(nativeImageSize.width * scale));
    const height = Math.max(72, Math.round(nativeImageSize.height * scale));
    return { width, height };
  }, [nativeImageSize, viewportWidth]);

  const documentHtml = useMemo(() => {
    const normalizedHtml = normalizeExamRichTextToHtml(html);
    const resolvedImageUrl = toMediaUrl(imageUrl);
    const resolvedVideoUrl = toMediaUrl(videoUrl);
    const youtubeEmbedUrl = videoType === 'youtube' ? getYoutubeEmbedUrl(videoUrl) : '';

    const mediaBlocks: string[] = [];

    if (resolvedImageUrl) {
      mediaBlocks.push(`<img class="question-media" src="${escapeHtml(resolvedImageUrl)}" alt="Media soal" />`);
    }

    if (showInlineVideo && youtubeEmbedUrl) {
      mediaBlocks.push(`
        <div class="video-shell">
          <iframe
            src="${escapeHtml(youtubeEmbedUrl)}"
            title="Video soal"
            loading="lazy"
            referrerpolicy="no-referrer"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          ></iframe>
        </div>
      `);
    } else if (showInlineVideo && resolvedVideoUrl) {
      mediaBlocks.push(`
        <div class="video-shell">
          <video
            src="${escapeHtml(resolvedVideoUrl)}"
            controls
            playsinline
            controlsList="nodownload noremoteplayback nofullscreen"
            disablepictureinpicture
            preload="metadata"
          ></video>
        </div>
      `);
    }

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <style>
            :root {
              color-scheme: light;
            }
            * {
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: ${backgroundColor};
              color: #0f172a;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              font-size: 15px;
              line-height: 1.6;
              overflow-x: hidden;
            }
            body {
              padding: 0;
            }
            p, div, li, span {
              max-width: 100%;
              word-break: normal;
              overflow-wrap: break-word;
            }
            .exam-content p,
            .exam-content div,
            .exam-content li {
              text-align: ${textAlign};
            }
            img.question-media,
            .exam-content img {
              max-width: 100%;
              height: auto;
              display: block;
              border-radius: 12px;
              margin: 0 0 12px;
              cursor: zoom-in;
            }
            .exam-office-table {
              display: flex;
              flex-direction: column;
              gap: 4px;
              margin-bottom: 8px;
            }
            .exam-office-row {
              display: flex;
              flex-wrap: wrap;
              gap: 4px;
            }
            .exam-office-cell {
              display: inline-flex;
              align-items: flex-start;
              padding: 2px 0;
            }
            .exam-formula-fallback {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 8px;
              background: #eff6ff;
              border: 1px solid #bfdbfe;
              color: #1d4ed8;
              font-family: "SFMono-Regular", Consolas, monospace;
              font-size: 0.92em;
              white-space: pre-wrap;
            }
            .video-shell {
              width: 100%;
              margin: 0 0 12px;
              border-radius: 12px;
              overflow: hidden;
              background: #0f172a;
            }
            .video-shell iframe,
            .video-shell video {
              width: 100%;
              aspect-ratio: 16 / 9;
              border: 0;
              display: block;
              background: #0f172a;
            }
          </style>
        </head>
        <body>
          ${mediaBlocks.join('')}
          <div class="exam-content">${normalizedHtml}</div>
          <script>
            (function () {
              var postMessage = function (payload) {
                window.ReactNativeWebView.postMessage(JSON.stringify(payload));
              };
              var sendHeight = function () {
                var nextHeight = Math.max(
                  document.body.scrollHeight || 0,
                  document.documentElement.scrollHeight || 0,
                  ${safeMinHeight}
                );
                postMessage({ type: 'height', value: nextHeight });
              };
              var handleImageClick = function (event) {
                var target = event.target;
                if (!target || target.tagName !== 'IMG') return;
                var src = String(target.currentSrc || target.src || target.getAttribute('src') || '').trim();
                if (!src) return;
                event.preventDefault();
                postMessage({ type: 'image-preview', src: src });
              };
              window.addEventListener('load', function () {
                Array.prototype.forEach.call(document.images || [], function (img) {
                  img.addEventListener('load', sendHeight);
                });
                document.addEventListener('click', handleImageClick, true);
                setTimeout(sendHeight, 0);
                setTimeout(sendHeight, 250);
                setTimeout(sendHeight, 800);
              });
              window.addEventListener('resize', sendHeight);
              setTimeout(sendHeight, 0);
            })();
            true;
          </script>
        </body>
      </html>`;
  }, [backgroundColor, html, imageUrl, safeMinHeight, showInlineVideo, textAlign, videoType, videoUrl]);

  if (renderMode === 'native') {
    const hasText = nativeTextContent.length > 0 && nativeTextContent !== '-';
    const hasImage = Boolean(resolvedNativeImageUrl);

    return (
      <View style={{ minHeight: safeMinHeight, backgroundColor }}>
        {hasText ? (
          <Text
            selectable={false}
            style={{
              color: '#0f172a',
              fontSize: scaleFont(15),
              lineHeight: scaleLineHeight(22),
              textAlign,
              marginBottom: hasImage ? 10 : 0,
            }}
          >
            {nativeTextContent}
          </Text>
        ) : null}
        {hasImage ? (
          <Pressable
            disabled={typeof onImagePress !== 'function'}
            onPress={() => {
              if (resolvedNativeImageUrl && typeof onImagePress === 'function') {
                onImagePress(resolvedNativeImageUrl);
              }
            }}
            style={{ alignSelf: 'center' }}
          >
            <Image
              source={{ uri: resolvedNativeImageUrl }}
              resizeMode="contain"
              style={{
                width: nativeImageFrame?.width ?? Math.max(140, Math.min(viewportWidth - 96, 220)),
                height: nativeImageFrame?.height ?? 120,
                borderRadius: 12,
                backgroundColor: 'transparent',
              }}
            />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
      <View
        pointerEvents={interactive || typeof onImagePress === 'function' ? 'auto' : 'none'}
      style={{ minHeight: height, backgroundColor }}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html: documentHtml, baseUrl: webBaseUrl }}
        style={{ height, backgroundColor }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        onMessage={(event) => {
          let payload: { type?: string; value?: unknown; src?: unknown } | null = null;
          try {
            payload = JSON.parse(String(event.nativeEvent.data || ''));
          } catch {
            payload = {
              type: 'height',
              value: Number.parseInt(String(event.nativeEvent.data || ''), 10),
            };
          }

          if (payload?.type === 'image-preview') {
            const src = String(payload.src || '').trim();
            if (src && typeof onImagePress === 'function') {
              onImagePress(src);
            }
            return;
          }

          const nextHeight = Number.parseInt(String(payload?.value ?? ''), 10);
          if (Number.isFinite(nextHeight) && nextHeight >= safeMinHeight) {
            setHeight(nextHeight);
          }
        }}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

export default ExamHtmlContent;
