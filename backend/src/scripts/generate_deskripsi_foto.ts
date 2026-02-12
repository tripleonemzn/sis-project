import fs from 'fs';
import path from 'path';

async function main() {
  const baseDir = path.resolve(process.cwd(), '../foto_kegiatan');
  await fs.promises.mkdir(baseDir, { recursive: true });

  const files = await fs.promises.readdir(baseDir);
  const images = files
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
    })
    .sort();

  const lines = images.map((f) => {
    const name = f.replace(/\.(jpg|jpeg|png|webp)$/i, '').replace(/[-_]/g, ' ');
    return `Foto: ${name}`;
  });

  const target = path.join(baseDir, 'deskripsi foto.txt');
  await fs.promises.writeFile(target, lines.join('\n'), 'utf-8');
  console.log(`Generated ${target} for ${images.length} images`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

