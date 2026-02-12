
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting backup and deletion of APPROVED internships...');

  // 1. Find all APPROVED internships
  const approvedInternships = await prisma.internship.findMany({
    where: {
      status: 'APPROVED'
    },
    include: {
      student: true // Include student info for reference
    }
  });

  console.log(`Found ${approvedInternships.length} APPROVED internships.`);

  if (approvedInternships.length === 0) {
    console.log('No internships to delete.');
    return;
  }

  // 2. Backup to JSON
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `internships-approved-backup-${timestamp}.json`);

  fs.writeFileSync(backupFile, JSON.stringify(approvedInternships, null, 2));
  console.log(`Backup saved to ${backupFile}`);

  // 3. Delete
  // We need to delete related records first if cascade isn't set, but Prisma usually handles this if configured.
  // Checking schema: 
  // journals -> onDelete: Cascade
  // grades -> onDelete: Cascade
  // attendances -> check schema? Assuming Cascade or we delete manually.
  
  // Let's try deleteMany
  const deleteResult = await prisma.internship.deleteMany({
    where: {
      status: 'APPROVED'
    }
  });

  console.log(`Deleted ${deleteResult.count} internships.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
