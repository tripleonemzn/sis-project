import { Request, Response } from 'express';
import { ApiResponse, asyncHandler } from '../utils/api';
import { resolveGalleryDir } from '../utils/galleryPath';
import { listGallerySlides, toPublicGalleryImageUrl } from '../utils/galleryStore';

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
