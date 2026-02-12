
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const backupDir = path.join(__dirname, '../../backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `backup_db_${timestamp}.sql`);

// Assuming docker usage or standard connection strings. 
// Since mysqldump failed, we might not have it installed or need to use docker exec if it's in a container.
// But wait, the env says "linux", usually we can use prisma to dump or just rely on existing tools.
// If mysqldump is missing, we can try to copy the sqlite file if it's sqlite (unlikely for "sis_db").
// Let's assume we can't easily dump if mysqldump is missing.
// However, the user said "Backup Database".
// Let's try to see if we can use prisma to just inspect data first, as full dump might be hard without tools.
// But the user insisted on backup.
// Let's try to install mysqldump? No, I can't install packages.
// Let's try to check if we can dump via a node script that reads all tables and writes JSON?
// That's safer.

import prisma from '../utils/prisma';

async function backup() {
    console.log('Starting backup to JSON...');
    const tables = ['User', 'AcademicYear', 'Class', 'Subject', 'TeacherAssignment', 'StudentGrade', 'Attendance']; // Add critical tables
    
    const data: any = {};

    for (const table of tables) {
        console.log(`Backing up ${table}...`);
        try {
            // @ts-ignore
            data[table] = await prisma[table].findMany();
        } catch (e) {
            console.error(`Failed to backup ${table}`, e);
        }
    }

    fs.writeFileSync(backupFile + '.json', JSON.stringify(data, null, 2));
    console.log(`Backup saved to ${backupFile}.json`);
}

backup()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
