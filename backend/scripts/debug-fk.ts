
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Checking tables...');
    
    // Check subject_categories
    try {
        const categories = await prisma.$queryRaw`SELECT * FROM subject_categories`;
        console.log('Subject Categories:', categories);
    } catch (e) {
        console.log('Error querying subject_categories:', (e as Error).message);
    }

    // Check subjects
    try {
        const subjects = await prisma.$queryRaw`SELECT id, "subjectCategoryId" FROM subjects WHERE "subjectCategoryId" IS NOT NULL`;
        console.log('Subjects with category:', subjects);
        
        // Check for orphans
        const orphans = await prisma.$queryRaw`
            SELECT s.id, s."subjectCategoryId" 
            FROM subjects s 
            LEFT JOIN subject_categories c ON s."subjectCategoryId" = c.id 
            WHERE s."subjectCategoryId" IS NOT NULL AND c.id IS NULL
        `;
        console.log('Orphan subjects:', orphans);
    } catch (e) {
        console.log('Error querying subjects:', (e as Error).message);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
