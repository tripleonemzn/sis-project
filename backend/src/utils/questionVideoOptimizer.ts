import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4']);
const DEFAULT_CRF = 29;
const DEFAULT_PRESET = 'veryfast';
const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_MAX_HEIGHT = 720;
const DEFAULT_AUDIO_BITRATE_K = 96;
const MIN_BYTES_SAVED_TO_REWRITE = 250 * 1024;
const MIN_RELATIVE_SAVING_RATIO = 0.1;

export type OptimizeVideoResult = {
  optimized: boolean;
  skipped: boolean;
  reason?: string;
  originalBytes: number;
  outputBytes: number;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg_exit_${code}: ${stderr.trim() || 'unknown_error'}`));
    });
  });
}

export async function optimizeQuestionVideoAtPath(inputPath: string): Promise<OptimizeVideoResult> {
  const extension = path.extname(inputPath).toLowerCase();
  const originalStat = await fs.stat(inputPath);
  const originalBytes = originalStat.size;

  if (!SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
    return {
      optimized: false,
      skipped: true,
      reason: `unsupported_extension:${extension || 'none'}`,
      originalBytes,
      outputBytes: originalBytes,
    };
  }

  const crf = parsePositiveInteger(process.env.QUESTION_VIDEO_CRF, DEFAULT_CRF);
  const maxWidth = parsePositiveInteger(process.env.QUESTION_VIDEO_MAX_WIDTH, DEFAULT_MAX_WIDTH);
  const maxHeight = parsePositiveInteger(process.env.QUESTION_VIDEO_MAX_HEIGHT, DEFAULT_MAX_HEIGHT);
  const audioBitrate = parsePositiveInteger(process.env.QUESTION_VIDEO_AUDIO_BITRATE_K, DEFAULT_AUDIO_BITRATE_K);
  const preset = String(process.env.QUESTION_VIDEO_PRESET || DEFAULT_PRESET).trim() || DEFAULT_PRESET;

  const tmpPath = `${inputPath}.tmp-opt.mp4`;
  const scaleFilter =
    `scale=w='min(${maxWidth},iw)':h='min(${maxHeight},ih)':` +
    'force_original_aspect_ratio=decrease:force_divisible_by=2';
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    scaleFilter,
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    `${audioBitrate}k`,
    tmpPath,
  ];

  try {
    await runFfmpeg(args);
    const optimizedStat = await fs.stat(tmpPath);
    const outputBytes = optimizedStat.size;
    const requiredSavedBytes = Math.max(
      MIN_BYTES_SAVED_TO_REWRITE,
      Math.floor(originalBytes * MIN_RELATIVE_SAVING_RATIO),
    );
    const shouldRewrite = outputBytes + requiredSavedBytes < originalBytes;

    if (!shouldRewrite) {
      await fs.unlink(tmpPath).catch(() => undefined);
      return {
        optimized: false,
        skipped: true,
        reason: 'no_meaningful_reduction',
        originalBytes,
        outputBytes: originalBytes,
      };
    }

    await fs.rename(tmpPath, inputPath);
    return {
      optimized: true,
      skipped: false,
      originalBytes,
      outputBytes,
    };
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}
