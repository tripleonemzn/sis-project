
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkActiveYear() {
  try {
    const activeYears = await prisma.academicYear.findMany({
        where: { isActive: true }
    });
    console.log("DB Active Years:", JSON.stringify(activeYears, null, 2));

    if (activeYears.length === 0) {
        console.log("CRITICAL: No active academic year in DB!");
    } else {
        console.log("Active year exists in DB.");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkActiveYear();
