import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.webp', '.gif']);
const DEFAULT_MAX_DIMENSION = 1400;
const DEFAULT_THUMB_MAX_DIMENSION = 960;
const DEFAULT_JPEG_QUALITY = 72;
const DEFAULT_PNG_QUALITY = 75;
const DEFAULT_WEBP_QUALITY = 72;
const DEFAULT_THUMB_WEBP_QUALITY = 68;
const DEFAULT_GIF_COLORS = 128;
const MIN_BYTES_SAVED_TO_REWRITE = 12 * 1024;
const MIN_RELATIVE_SAVING_RATIO = 0.1;

export type OptimizeImageResult = {
  optimized: boolean;
  skipped: boolean;
  reason?: string;
  originalBytes: number;
  outputBytes: number;
  width: number | null;
  height: number | null;
  thumbnailGenerated: boolean;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getMaxDimension(): number {
  return parsePositiveInteger(process.env.QUESTION_IMAGE_MAX_DIMENSION, DEFAULT_MAX_DIMENSION);
}

function getJpegQuality(): number {
  return Math.min(95, Math.max(45, parsePositiveInteger(process.env.QUESTION_IMAGE_JPEG_QUALITY, DEFAULT_JPEG_QUALITY)));
}

function getPngQuality(): number {
  return Math.min(95, Math.max(45, parsePositiveInteger(process.env.QUESTION_IMAGE_PNG_QUALITY, DEFAULT_PNG_QUALITY)));
}

function getWebpQuality(): number {
  return Math.min(95, Math.max(45, parsePositiveInteger(process.env.QUESTION_IMAGE_WEBP_QUALITY, DEFAULT_WEBP_QUALITY)));
}

function getGifColors(): number {
  return Math.min(256, Math.max(32, parsePositiveInteger(process.env.QUESTION_IMAGE_GIF_COLORS, DEFAULT_GIF_COLORS)));
}

function getThumbMaxDimension(): number {
  return parsePositiveInteger(process.env.QUESTION_IMAGE_THUMB_MAX_DIMENSION, DEFAULT_THUMB_MAX_DIMENSION);
}

function getThumbWebpQuality(): number {
  return Math.min(
    90,
    Math.max(35, parsePositiveInteger(process.env.QUESTION_IMAGE_THUMB_WEBP_QUALITY, DEFAULT_THUMB_WEBP_QUALITY)),
  );
}

function getThumbnailPath(inputPath: string): string {
  const extension = path.extname(inputPath);
  const basename = extension ? inputPath.slice(0, -extension.length) : inputPath;
  return `${basename}.thumb.webp`;
}

async function generateQuestionImageThumbnail(inputPath: string): Promise<boolean> {
  const maxDimension = getThumbMaxDimension();
  const quality = getThumbWebpQuality();
  const thumbnailPath = getThumbnailPath(inputPath);
  const tmpPath = `${thumbnailPath}.tmp-opt`;

  const buffer = await sharp(inputPath, { animated: false, failOnError: false })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality,
      effort: 5,
      smartSubsample: true,
    })
    .toBuffer();

  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, thumbnailPath);
  return true;
}

function buildPipeline(inputPath: string, extension: string) {
  const maxDimension = getMaxDimension();
  const source = sharp(inputPath, {
    animated: extension === '.gif',
    failOnError: false,
  }).rotate();

  const pipeline = source.resize({
    width: maxDimension,
    height: maxDimension,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (extension === '.png') {
    return pipeline.png({
      compressionLevel: 9,
      effort: 10,
      palette: true,
      quality: getPngQuality(),
      adaptiveFiltering: true,
    });
  }

  if (extension === '.webp') {
    return pipeline.webp({
      quality: getWebpQuality(),
      effort: 6,
      smartSubsample: true,
    });
  }

  if (extension === '.gif') {
    return pipeline.gif({
      effort: 8,
      colours: getGifColors(),
      dither: 0.7,
      interFrameMaxError: 4,
      interPaletteMaxError: 8,
      reuse: true,
    });
  }

  return pipeline.jpeg({
    quality: getJpegQuality(),
    mozjpeg: true,
    progressive: true,
    chromaSubsampling: '4:2:0',
  });
}

export async function optimizeQuestionImageAtPath(inputPath: string): Promise<OptimizeImageResult> {
  const extension = path.extname(inputPath).toLowerCase();
  const stat = await fs.stat(inputPath);
  const originalBytes = stat.size;

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return {
      optimized: false,
      skipped: true,
      reason: `unsupported_extension:${extension || 'none'}`,
      originalBytes,
      outputBytes: originalBytes,
      width: null,
      height: null,
      thumbnailGenerated: false,
    };
  }

  const metadata = await sharp(inputPath, { animated: extension === '.gif', failOnError: false }).metadata();
  const width = typeof metadata.width === 'number' ? metadata.width : null;
  const height = typeof metadata.height === 'number' ? metadata.height : null;

  const buffer = await buildPipeline(inputPath, extension).toBuffer();
  const outputBytes = buffer.length;
  const requiredSavedBytes = Math.max(
    MIN_BYTES_SAVED_TO_REWRITE,
    Math.floor(originalBytes * MIN_RELATIVE_SAVING_RATIO),
  );
  const shouldRewrite = outputBytes + requiredSavedBytes < originalBytes;

  if (!shouldRewrite) {
    const thumbnailGenerated = await generateQuestionImageThumbnail(inputPath).catch(() => false);
    return {
      optimized: false,
      skipped: true,
      reason: 'no_meaningful_reduction',
      originalBytes,
      outputBytes: originalBytes,
      width,
      height,
      thumbnailGenerated,
    };
  }

  const tmpPath = `${inputPath}.tmp-opt`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, inputPath);
  const thumbnailGenerated = await generateQuestionImageThumbnail(inputPath).catch(() => false);

  return {
    optimized: true,
    skipped: false,
    originalBytes,
    outputBytes,
    width,
    height,
    thumbnailGenerated,
  };
}
