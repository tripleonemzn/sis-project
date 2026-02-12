
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Auditing KKM discrepancies...');

  // 1. Get all TeacherAssignments with KKM 75 (default)
  const assignments = await prisma.teacherAssignment.findMany({
    where: { kkm: 75 },
    include: {
      subject: {
        include: {
          kkms: true
        }
      },
      class: true
    }
  });

  console.log(`Found ${assignments.length} assignments with KKM 75.`);

  const suspicious: any[] = [];

  for (const a of assignments) {
    const classLevel = a.class.level; // X, XI, XII
    const subjectKkms = a.subject.kkms;

    // Check if KKM exists for this level
    const kkmForLevel = subjectKkms.find(k => k.classLevel === classLevel);

    if (kkmForLevel) {
      // If KKM exists for this level and it is NOT 75, then it's a sync error.
      if (kkmForLevel.kkm !== 75) {
        console.log(`[SYNC ERROR] Assignment ${a.id} (Subj: ${a.subject.code}, Class: ${a.class.name}) has KKM 75, but SubjectKKM for ${classLevel} is ${kkmForLevel.kkm}`);
        
        // Auto-fix sync error
        await prisma.teacherAssignment.update({
            where: { id: a.id },
            data: { kkm: kkmForLevel.kkm }
        });
      }
    } else {
      // KKM does NOT exist for this level.
      // Check if KKM exists for OTHER levels (implying user might have forgotten to set it for this level)
      if (subjectKkms.length > 0) {
        const otherKkms = subjectKkms.map(k => `${k.classLevel}:${k.kkm}`).join(', ');
        // Avoid duplicates in log
        const key = `${a.subject.code}-${classLevel}`;
        if (!suspicious.find(s => s.key === key)) {
          suspicious.push({
            key,
            subject: a.subject.name,
            code: a.subject.code,
            missingLevel: classLevel,
            existingKkms: otherKkms
          });
        }
        
        // FIX FOR KK16 SPECIFICALLY requested by user
        if (a.subject.code === 'KK16' && classLevel === 'XII') {
             const kkmXI = subjectKkms.find(k => k.classLevel === 'XI');
             if (kkmXI) {
                 console.log(`[AUTO-FIX] Creating KKM for KK16 Class XII based on Class XI value (${kkmXI.kkm})`);
                 await prisma.subjectKKM.create({
                     data: {
                         subjectId: a.subject.id,
                         classLevel: 'XII',
                         kkm: kkmXI.kkm
                     }
                 });
                 // Update assignment
                 await prisma.teacherAssignment.update({
                     where: { id: a.id },
                     data: { kkm: kkmXI.kkm }
                 });
             }
        }
      }
    }
  }

  console.log('\nPotential missing KKM inputs (Subject has KKM for some levels but not for the taught class level):');
  console.table(suspicious);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
