import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export type GallerySlideRecord = {
  id: string;
  filename: string;
  description: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const GALLERY_METADATA_FILENAME = 'slideshow.meta.json';
const GALLERY_LEGACY_DESCRIPTION_FILENAME = 'deskripsi foto.txt';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const toStringOrEmpty = (value: unknown) => (typeof value === 'string' ? value : '');

const toSafeBoolean = (value: unknown, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'ya', 'aktif', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'tidak', 'nonaktif', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const toSafeInteger = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return Math.max(0, Math.trunc(fallback));
};

const toSafeDateString = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
};

const parseSlideRecord = (value: unknown): GallerySlideRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const filename = toStringOrEmpty(input.filename).trim();
  if (!filename) return null;

  const now = new Date().toISOString();
  return {
    id: toStringOrEmpty(input.id).trim() || randomUUID(),
    filename,
    description: toStringOrEmpty(input.description).trim(),
    order: toSafeInteger(input.order, 0),
    isActive: toSafeBoolean(input.isActive, true),
    createdAt: toSafeDateString(input.createdAt, now),
    updatedAt: toSafeDateString(input.updatedAt, now),
  };
};

export const isGalleryImageFilename = (filename: string) => {
  const ext = path.extname(filename || '').toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};

const sortImageFilenames = (filenames: string[]) => {
  return [...filenames].sort((a, b) => {
    const rx = /(\d+)/;
    const ma = a.match(rx);
    const mb = b.match(rx);
    if (ma && mb) {
      const na = Number(ma[1]);
      const nb = Number(mb[1]);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
};

const normalizeSlideOrder = (slides: GallerySlideRecord[]) =>
  [...slides]
    .sort((a, b) => (a.order === b.order ? a.filename.localeCompare(b.filename) : a.order - b.order))
    .map((slide, index) => ({ ...slide, order: index }));

const slidesEqual = (a: GallerySlideRecord[], b: GallerySlideRecord[]) => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.filename !== right.filename ||
      left.description !== right.description ||
      left.order !== right.order ||
      left.isActive !== right.isActive ||
      left.createdAt !== right.createdAt ||
      left.updatedAt !== right.updatedAt
    ) {
      return false;
    }
  }
  return true;
};

const readMetadata = async (baseDir: string) => {
  const targetPath = path.join(baseDir, GALLERY_METADATA_FILENAME);
  try {
    const raw = await fs.promises.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed.map(parseSlideRecord).filter((item): item is GallerySlideRecord => !!item)
      : [];
    return { exists: true, items };
  } catch {
    return { exists: false, items: [] as GallerySlideRecord[] };
  }
};

const readLegacyDescriptions = async (baseDir: string) => {
  const targetPath = path.join(baseDir, GALLERY_LEGACY_DESCRIPTION_FILENAME);
  try {
    const raw = await fs.promises.readFile(targetPath, 'utf-8');
    return raw.split('\n').map((line) => line.trim());
  } catch {
    return [] as string[];
  }
};

const writeMetadata = async (baseDir: string, slides: GallerySlideRecord[]) => {
  const targetPath = path.join(baseDir, GALLERY_METADATA_FILENAME);
  await fs.promises.writeFile(targetPath, `${JSON.stringify(slides, null, 2)}\n`, 'utf-8');
};

const writeLegacyDescriptions = async (baseDir: string, slides: GallerySlideRecord[]) => {
  const targetPath = path.join(baseDir, GALLERY_LEGACY_DESCRIPTION_FILENAME);
  const lines = normalizeSlideOrder(slides).map((slide) => (slide.description || '').trim());
  const payload = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fs.promises.writeFile(targetPath, payload, 'utf-8');
};

export const getGalleryMetadataPath = (baseDir: string) => path.join(baseDir, GALLERY_METADATA_FILENAME);

export const toPublicGalleryImageUrl = (filename: string) =>
  `/api/public/foto-kegiatan/file?name=${encodeURIComponent(filename)}`;

export const listGallerySlides = async (baseDir: string) => {
  await fs.promises.mkdir(baseDir, { recursive: true });
  const files = await fs.promises.readdir(baseDir);
  const imageFiles = sortImageFilenames(files.filter((name) => isGalleryImageFilename(name)));

  const [metadataResult, legacyDescriptions] = await Promise.all([
    readMetadata(baseDir),
    readLegacyDescriptions(baseDir),
  ]);

  const metadataByFilename = new Map<string, GallerySlideRecord>();
  for (const item of metadataResult.items) {
    metadataByFilename.set(item.filename, item);
  }

  let hasChanges = !metadataResult.exists;
  const now = new Date().toISOString();
  const mergedSlides: GallerySlideRecord[] = imageFiles.map((filename, index) => {
    const existing = metadataByFilename.get(filename);
    if (!existing) {
      hasChanges = true;
      return {
        id: randomUUID(),
        filename,
        description: legacyDescriptions[index] || '',
        order: index,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
    }
    return {
      ...existing,
      filename,
      description: (existing.description || '').trim(),
      order: toSafeInteger(existing.order, index),
      isActive: toSafeBoolean(existing.isActive, true),
      createdAt: toSafeDateString(existing.createdAt, now),
      updatedAt: toSafeDateString(existing.updatedAt, now),
    };
  });

  if (!hasChanges && metadataResult.items.length !== mergedSlides.length) {
    hasChanges = true;
  }

  const normalizedSlides = normalizeSlideOrder(mergedSlides);
  if (!hasChanges) {
    const normalizedFromMetadata = normalizeSlideOrder(
      metadataResult.items.filter((item) => imageFiles.includes(item.filename)),
    );
    hasChanges = !slidesEqual(normalizedSlides, normalizedFromMetadata);
  }

  if (hasChanges) {
    await writeMetadata(baseDir, normalizedSlides);
    await writeLegacyDescriptions(baseDir, normalizedSlides);
  }

  return normalizedSlides;
};

export const saveGallerySlides = async (baseDir: string, slides: GallerySlideRecord[]) => {
  await fs.promises.mkdir(baseDir, { recursive: true });
  const now = new Date().toISOString();
  const normalized = normalizeSlideOrder(
    slides
      .map((slide, index) => {
        const parsed = parseSlideRecord(slide);
        if (!parsed) return null;
        return {
          ...parsed,
          order: toSafeInteger(parsed.order, index),
          createdAt: toSafeDateString(parsed.createdAt, now),
          updatedAt: toSafeDateString(parsed.updatedAt, now),
        };
      })
      .filter((slide): slide is GallerySlideRecord => !!slide),
  );
  await writeMetadata(baseDir, normalized);
  await writeLegacyDescriptions(baseDir, normalized);
  return normalized;
};
