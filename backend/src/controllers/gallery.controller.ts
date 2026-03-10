import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { resolveGalleryDir } from '../utils/galleryPath';
import { isGalleryImageFilename, listGallerySlides, toPublicGalleryImageUrl } from '../utils/galleryStore';

export const getGallery = asyncHandler(async (req: Request, res: Response) => {
  const baseDir = resolveGalleryDir();
  const slides = await listGallerySlides(baseDir);
  const items = slides
    .filter((slide) => slide.isActive !== false)
    .map((slide) => ({
      id: slide.id,
      url: toPublicGalleryImageUrl(slide.filename),
      description: slide.description || '',
    }));

  res.status(200).json(new ApiResponse(200, items, 'Galeri berhasil diambil'));
});

export const getGalleryImage = asyncHandler(async (req: Request, res: Response) => {
  const rawName = String(req.query?.name || '').trim();
  const filename = path.basename(rawName);

  if (!filename || filename !== rawName) {
    throw new ApiError(400, 'Nama file slideshow tidak valid');
  }

  if (!isGalleryImageFilename(filename)) {
    throw new ApiError(400, 'Format gambar slideshow tidak didukung');
  }

  const baseDir = resolveGalleryDir();
  const targetPath = path.join(baseDir, filename);

  try {
    await fs.promises.access(targetPath, fs.constants.R_OK);
  } catch {
    throw new ApiError(404, 'Gambar slideshow tidak ditemukan');
  }

  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(targetPath);
});
