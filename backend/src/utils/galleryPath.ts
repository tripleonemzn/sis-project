import fs from 'fs';
import path from 'path';

const CANDIDATE_DIRS = [
  path.resolve(process.cwd(), 'frontend/public/foto_kegiatan'),
  path.resolve(process.cwd(), '../frontend/public/foto_kegiatan'),
  path.resolve(process.cwd(), 'foto_kegiatan'),
  path.resolve(process.cwd(), '../foto_kegiatan'),
  path.resolve(__dirname, '../../../frontend/public/foto_kegiatan'),
  path.resolve(__dirname, '../../../foto_kegiatan'),
];

const isImageFile = (filename: string) => {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  );
};

const countImageFiles = (dir: string) => {
  try {
    const files = fs.readdirSync(dir);
    return files.filter((name) => isImageFile(name)).length;
  } catch {
    return 0;
  }
};

export const resolveGalleryDir = () => {
  for (const dir of CANDIDATE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    if (countImageFiles(dir) > 0) return dir;
  }

  for (const dir of CANDIDATE_DIRS) {
    if (fs.existsSync(dir)) return dir;
  }

  return CANDIDATE_DIRS[0];
};
