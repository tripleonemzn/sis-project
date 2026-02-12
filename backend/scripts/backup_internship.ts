
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function backup() {
  console.log('Starting backup of Internship tables...');
  
  try {
    const internships = await prisma.internship.findMany();
    const journals = await prisma.internshipJournal.findMany();
    const attendances = await prisma.internshipAttendance.findMany();

    const backupData = {
      internships,
      journals,
      attendances,
      timestamp: new Date().toISOString()
    };

    const backupPath = path.join(__dirname, '..', 'backup_internship_data.json');
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    
    console.log(`Backup saved to ${backupPath}`);
  } catch (error) {
    console.error('Backup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
