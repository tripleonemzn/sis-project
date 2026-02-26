import fs from 'fs';
import path from 'path';
import { resolveGalleryDir } from './galleryPath';

const SETTINGS_FILENAME = 'slideshow.settings.json';

export type GallerySettings = {
  slideIntervalMs: number;
};

const DEFAULT_SETTINGS: GallerySettings = {
  slideIntervalMs: 3500,
};

export const getGallerySettingsPath = () => {
  const baseDir = resolveGalleryDir();
  return path.join(baseDir, SETTINGS_FILENAME);
};

export const loadGallerySettings = async (): Promise<GallerySettings> => {
  const targetPath = getGallerySettingsPath();
  try {
    const raw = await fs.promises.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GallerySettings>;
    const interval = typeof parsed.slideIntervalMs === 'number' ? parsed.slideIntervalMs : DEFAULT_SETTINGS.slideIntervalMs;
    const safeInterval = Math.min(Math.max(interval, 1000), 30000);
    return { slideIntervalMs: safeInterval };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveGallerySettings = async (settings: GallerySettings): Promise<GallerySettings> => {
  const baseDir = resolveGalleryDir();
  await fs.promises.mkdir(baseDir, { recursive: true });
  const next: GallerySettings = {
    slideIntervalMs: Math.min(Math.max(settings.slideIntervalMs || DEFAULT_SETTINGS.slideIntervalMs, 1000), 30000),
  };
  const targetPath = path.join(baseDir, SETTINGS_FILENAME);
  await fs.promises.writeFile(targetPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
};

