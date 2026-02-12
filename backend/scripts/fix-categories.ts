
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const categoriesToRestore = [
      { id: 1, code: 'UMUM', name: 'Muatan Nasional', description: 'Mata pelajaran muatan nasional' },
      { id: 2, code: 'MULOK', name: 'Muatan Lokal', description: 'Mata pelajaran muatan lokal' },
      { id: 3, code: 'C1', name: 'Dasar Bidang Keahlian', description: 'Mata pelajaran dasar bidang keahlian' },
      { id: 4, code: 'C2', name: 'Dasar Program Keahlian', description: 'Mata pelajaran dasar program keahlian' },
      { id: 5, code: 'C3', name: 'Kompetensi Keahlian', description: 'Mata pelajaran kompetensi keahlian' },
      { id: 7, code: 'PILIHAN', name: 'Mata Pelajaran Pilihan', description: 'Mata pelajaran pilihan' },
    ];

    console.log('Restoring subject categories...');

    for (const cat of categoriesToRestore) {
      // Use raw query to force insert with specific ID
      await prisma.$executeRaw`
        INSERT INTO subject_categories (id, code, name, description, "createdAt", "updatedAt")
        VALUES (${cat.id}, ${cat.code}, ${cat.name}, ${cat.description}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET 
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            description = EXCLUDED.description;
      `;
      console.log(`Restored category ID ${cat.id}: ${cat.name}`);
    }

    console.log('Done.');

  } catch (e) {
    console.error('Error restoring categories:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
