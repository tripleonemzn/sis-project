import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ApiResponse, asyncHandler } from '../utils/api';

const baseDir = path.resolve(process.cwd(), '../foto_kegiatan');
const descriptionFile = path.join(baseDir, 'deskripsi foto.txt');

export const getGallery = asyncHandler(async (req: Request, res: Response) => {
  const files = await fs.promises.readdir(baseDir);

  const imageFiles = files
    .filter((f) => {
      const lower = f.toLowerCase();
      return (
        (lower.endsWith('.jpg') ||
          lower.endsWith('.jpeg') ||
          lower.endsWith('.png') ||
          lower.endsWith('.webp')) &&
        lower !== 'deskripsi foto.txt'
      );
    })
    .sort((a, b) => {
      const rx = /(\d+)/;
      const ma = a.match(rx);
      const mb = b.match(rx);
      if (ma && mb) {
        const na = parseInt(ma[1], 10);
        const nb = parseInt(mb[1], 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      }
      return a.localeCompare(b);
    });

  let descriptions: string[] = [];
  try {
    const raw = await fs.promises.readFile(descriptionFile, 'utf-8');
    descriptions = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    descriptions = [];
  }

  const items = imageFiles.map((filename, index) => ({
    url: `/foto_kegiatan/${filename}`,
    description: descriptions[index] || '',
  }));

  res.status(200).json(new ApiResponse(200, items, 'Galeri berhasil diambil'));
});
