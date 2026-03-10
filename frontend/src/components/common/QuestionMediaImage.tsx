import type { ImgHTMLAttributes } from 'react';
import { useMemo } from 'react';
import { buildQuestionImageThumbnailUrl } from '../../utils/questionMedia';

type QuestionMediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  preferThumbnail?: boolean;
};

export function QuestionMediaImage({
  src,
  alt,
  preferThumbnail = true,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...rest
}: QuestionMediaImageProps) {
  const resolvedInputSrc = String(src || '').trim();
  const thumbnailSrc = useMemo(() => {
    if (!preferThumbnail) return resolvedInputSrc;
    return buildQuestionImageThumbnailUrl(resolvedInputSrc);
  }, [resolvedInputSrc, preferThumbnail]);

  const activeSrc = thumbnailSrc || resolvedInputSrc;

  return (
    <img
      {...rest}
      key={activeSrc || resolvedInputSrc}
      src={activeSrc || resolvedInputSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        const target = event.currentTarget;
        if (
          target.dataset.fallbackApplied !== '1' &&
          resolvedInputSrc &&
          activeSrc &&
          activeSrc !== resolvedInputSrc
        ) {
          target.dataset.fallbackApplied = '1';
          target.src = resolvedInputSrc;
          return;
        }
        onError?.(event);
      }}
    />
  );
}
