
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function backupAndDeleteApproved() {
  try {
    console.log('Starting backup and delete process for APPROVED internships...');

    // 1. Find all APPROVED internships
    const approvedInternships = await prisma.internship.findMany({
      where: {
        status: 'APPROVED'
      },
      include: {
        student: true,
        teacher: true,
        examiner: true
      }
    });

    console.log(`Found ${approvedInternships.length} APPROVED internships.`);

    if (approvedInternships.length === 0) {
      console.log('No APPROVED internships found. Exiting.');
      return;
    }

    // 2. Backup to JSON file
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `approved_internships_backup_${timestamp}.json`);

    fs.writeFileSync(backupFile, JSON.stringify(approvedInternships, null, 2));
    console.log(`Backup created at: ${backupFile}`);

    // 3. Delete from database
    const deleteResult = await prisma.internship.deleteMany({
      where: {
        status: 'APPROVED'
      }
    });

    console.log(`Deleted ${deleteResult.count} internships with status APPROVED.`);

  } catch (error) {
    console.error('Error during backup and delete process:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backupAndDeleteApproved();
