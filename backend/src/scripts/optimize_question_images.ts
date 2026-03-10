import fs from 'fs/promises';
import path from 'path';
import { optimizeQuestionImageAtPath } from '../utils/questionImageOptimizer';

type Candidate = {
  absPath: string;
  relPath: string;
};

async function collectFiles(rootDir: string): Promise<Candidate[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const result: Candidate[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.thumb.webp')) continue;
    if (entry.name.includes('.tmp-opt')) continue;
    const absPath = path.join(rootDir, entry.name);
    result.push({
      absPath,
      relPath: path.relative(process.cwd(), absPath),
    });
  }

  return result;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const uploadsDir = path.resolve(process.cwd(), '../uploads/questions/images');

  let files: Candidate[] = [];
  try {
    files = await collectFiles(uploadsDir);
  } catch (error) {
    console.error('[OPTIMIZE_QUESTION_IMAGES] gagal membaca folder:', uploadsDir);
    throw error;
  }

  console.log(`[OPTIMIZE_QUESTION_IMAGES] mode=${dryRun ? 'DRY_RUN' : 'EXECUTE'} totalFile=${files.length}`);

  let optimizedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let thumbnailGeneratedCount = 0;
  let originalTotalBytes = 0;
  let outputTotalBytes = 0;

  for (const file of files) {
    try {
      const stat = await fs.stat(file.absPath);
      originalTotalBytes += stat.size;

      if (dryRun) {
        skippedCount += 1;
        outputTotalBytes += stat.size;
        continue;
      }

      const result = await optimizeQuestionImageAtPath(file.absPath);
      if (result.thumbnailGenerated) {
        thumbnailGeneratedCount += 1;
      }
      outputTotalBytes += result.outputBytes;
      if (result.optimized) {
        optimizedCount += 1;
        const delta = result.originalBytes - result.outputBytes;
        console.log(`[OPTIMIZED] ${file.relPath} ${formatBytes(result.originalBytes)} -> ${formatBytes(result.outputBytes)} (hemat ${formatBytes(delta)})`);
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error(`[FAILED] ${file.relPath}`, error);
    }
  }

  const savedBytes = Math.max(0, originalTotalBytes - outputTotalBytes);
  const savedPercent = originalTotalBytes > 0 ? ((savedBytes / originalTotalBytes) * 100).toFixed(2) : '0.00';

  console.log('[OPTIMIZE_QUESTION_IMAGES] ringkasan');
  console.log(`  optimized: ${optimizedCount}`);
  console.log(`  skipped:   ${skippedCount}`);
  console.log(`  failed:    ${failedCount}`);
  console.log(`  thumbnails:${thumbnailGeneratedCount}`);
  console.log(`  before:    ${formatBytes(originalTotalBytes)}`);
  console.log(`  after:     ${formatBytes(outputTotalBytes)}`);
  console.log(`  saved:     ${formatBytes(savedBytes)} (${savedPercent}%)`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

void main();
