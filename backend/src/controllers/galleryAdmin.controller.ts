import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { resolveGalleryDir } from '../utils/galleryPath';
import { type GallerySlideRecord, listGallerySlides, saveGallerySlides, toPublicGalleryImageUrl } from '../utils/galleryStore';
import { loadGallerySettings, saveGallerySettings } from '../utils/gallerySettings';

const toBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'ya', 'aktif', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'tidak', 'nonaktif', 'off'].includes(normalized)) return false;
  return undefined;
};

const toIntegerOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return undefined;
};

const toSlideDto = (slide: GallerySlideRecord) => ({
  id: slide.id,
  filename: slide.filename,
  url: toPublicGalleryImageUrl(slide.filename),
  description: slide.description || '',
  order: slide.order,
  isActive: slide.isActive !== false,
  createdAt: slide.createdAt,
  updatedAt: slide.updatedAt,
});

export const listGallerySlidesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const baseDir = resolveGalleryDir();
  const slides = await listGallerySlides(baseDir);
  const settings = await loadGallerySettings();
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { slides: slides.map((item) => toSlideDto(item)), settings },
        'Daftar slideshow berhasil diambil',
      ),
    );
});

export const uploadGallerySlideAdmin = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new ApiError(400, 'File gambar wajib diupload');
  }

  const baseDir = resolveGalleryDir();
  const currentSlides = await listGallerySlides(baseDir);
  const now = new Date().toISOString();
  const description = String(req.body?.description || '').trim();
  const requestedActive = toBooleanOrUndefined(req.body?.isActive);

  const newSlide: GallerySlideRecord = {
    id: randomUUID(),
    filename: file.filename,
    description,
    order: currentSlides.length,
    isActive: requestedActive ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const savedSlides = await saveGallerySlides(baseDir, [...currentSlides, newSlide]);
  const createdSlide = savedSlides.find((slide) => slide.id === newSlide.id) || newSlide;

  res.status(201).json(
    new ApiResponse(
      201,
      {
        slide: toSlideDto(createdSlide),
        slides: savedSlides.map((item) => toSlideDto(item)),
      },
      'Slide berhasil ditambahkan',
    ),
  );
});

export const updateGallerySlideAdmin = asyncHandler(async (req: Request, res: Response) => {
  const slideId = String(req.params.id || '').trim();
  if (!slideId) throw new ApiError(400, 'ID slide tidak valid');

  const baseDir = resolveGalleryDir();
  const slides = await listGallerySlides(baseDir);
  const currentIndex = slides.findIndex((slide) => slide.id === slideId);
  if (currentIndex < 0) throw new ApiError(404, 'Slide tidak ditemukan');

  const now = new Date().toISOString();
  const currentSlide = slides[currentIndex];
  const nextDescription =
    typeof req.body?.description === 'string' ? req.body.description.trim() : currentSlide.description;
  const nextActive = toBooleanOrUndefined(req.body?.isActive);
  const nextOrder = toIntegerOrUndefined(req.body?.order);

  const updatedSlide: GallerySlideRecord = {
    ...currentSlide,
    description: nextDescription,
    isActive: typeof nextActive === 'boolean' ? nextActive : currentSlide.isActive,
    updatedAt: now,
  };

  let nextSlides = [...slides];
  if (typeof nextOrder === 'number') {
    const boundedOrder = Math.min(Math.max(0, nextOrder), Math.max(0, slides.length - 1));
    const withoutCurrent = slides.filter((slide) => slide.id !== slideId);
    withoutCurrent.splice(boundedOrder, 0, updatedSlide);
    nextSlides = withoutCurrent;
  } else {
    nextSlides[currentIndex] = updatedSlide;
  }

  const savedSlides = await saveGallerySlides(baseDir, nextSlides);
  const savedSlide = savedSlides.find((slide) => slide.id === slideId) || updatedSlide;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        slide: toSlideDto(savedSlide),
        slides: savedSlides.map((item) => toSlideDto(item)),
      },
      'Slide berhasil diperbarui',
    ),
  );
});

export const reorderGallerySlidesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const requestedIds = Array.isArray(req.body?.ids)
    ? req.body.ids.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : [];
  if (requestedIds.length === 0) {
    throw new ApiError(400, 'Urutan slide tidak valid');
  }

  const baseDir = resolveGalleryDir();
  const slides = await listGallerySlides(baseDir);
  const byId = new Map(slides.map((slide) => [slide.id, slide] as const));
  const used = new Set<string>();
  const now = new Date().toISOString();
  const reordered: GallerySlideRecord[] = [];

  for (const id of requestedIds) {
    const slide = byId.get(id);
    if (!slide || used.has(id)) continue;
    reordered.push({ ...slide, updatedAt: now });
    used.add(id);
  }

  for (const slide of slides) {
    if (used.has(slide.id)) continue;
    reordered.push(slide);
  }

  const savedSlides = await saveGallerySlides(baseDir, reordered);
  res.status(200).json(
    new ApiResponse(
      200,
      { slides: savedSlides.map((item) => toSlideDto(item)) },
      'Urutan slide berhasil diperbarui',
    ),
  );
});

export const deleteGallerySlideAdmin = asyncHandler(async (req: Request, res: Response) => {
  const slideId = String(req.params.id || '').trim();
  if (!slideId) throw new ApiError(400, 'ID slide tidak valid');

  const baseDir = resolveGalleryDir();
  const slides = await listGallerySlides(baseDir);
  const target = slides.find((slide) => slide.id === slideId);
  if (!target) throw new ApiError(404, 'Slide tidak ditemukan');

  const nextSlides = slides.filter((slide) => slide.id !== slideId);
  const savedSlides = await saveGallerySlides(baseDir, nextSlides);

  const filePath = path.join(baseDir, target.filename);
  await fs.promises.unlink(filePath).catch(() => undefined);

  res.status(200).json(
    new ApiResponse(
      200,
      { deletedId: slideId, slides: savedSlides.map((item) => toSlideDto(item)) },
      'Slide berhasil dihapus',
    ),
  );
});

export const updateGallerySettingsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const rawInterval = Number(req.body?.slideIntervalMs);
  if (!Number.isFinite(rawInterval)) {
    throw new ApiError(400, 'Durasi slide tidak valid');
  }
  const next = await saveGallerySettings({ slideIntervalMs: rawInterval });
  res.status(200).json(new ApiResponse(200, { settings: next }, 'Pengaturan slideshow berhasil diperbarui'));
});
