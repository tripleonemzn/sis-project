
import { reportService } from './src/services/report.service';
import prisma from './src/utils/prisma';
import { Semester } from '@prisma/client';

async function debugLive() {
  console.log('Debugging Live Ranking...');

  // 1. Find Class
  const cls = await prisma.class.findFirst({
    where: { name: { contains: 'XII TKJ 1' } }
  });
  
  if (!cls) { console.log('Class not found'); return; }

  // 2. Call Service
  const ranking = await reportService.getClassRankings(cls.id, cls.academicYearId, Semester.ODD);
  
  // 3. Find Afifah
  const afifah = ranking.rankings.find(r => r.student.name.toLowerCase().includes('afifah'));
  
  if (afifah) {
    console.log('Afifah Ranking Entry:');
    console.log(JSON.stringify(afifah, null, 2));
  } else {
    console.log('Afifah not found in ranking list!');
  }
}

debugLive()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
