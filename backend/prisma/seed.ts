import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding admin only...');
  const hashedPassword = await bcrypt.hash('P@ssw0rd', 10);

  // 1. Create Admin
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      name: 'Administrator',
      role: 'ADMIN',
      email: 'admin@sekolah.sch.id',
      verificationStatus: 'VERIFIED',
    },
  });
  console.log('Created Admin:', admin.username);

  // 2. Create Academic Year
  const academicYear = await prisma.academicYear.upsert({
    where: { name: '2024/2025' },
    update: {},
    create: {
      name: '2024/2025',
      semester1Start: new Date('2024-07-15'),
      semester1End: new Date('2024-12-20'),
      semester2Start: new Date('2025-01-06'),
      semester2End: new Date('2025-06-20'),
      isActive: true,
    },
  });
  console.log('Created Academic Year:', academicYear.name);

  // 3. Create Majors
  const rpl = await prisma.major.upsert({
    where: { code: 'RPL' },
    update: {},
    create: {
      name: 'Rekayasa Perangkat Lunak',
      code: 'RPL',
    },
  });
  
  const tkj = await prisma.major.upsert({
    where: { code: 'TKJ' },
    update: {},
    create: {
      name: 'Teknik Komputer dan Jaringan',
      code: 'TKJ',
    },
  });
  console.log('Created Majors:', rpl.code, tkj.code);

  // 4. Create Subject Categories
  const categories = [
    { code: 'UMUM', name: 'Umum', description: 'Mata pelajaran umum yang wajib diikuti oleh semua siswa (Nasional/Kewilayahan).' },
    { code: 'KEJURUAN', name: 'Kejuruan', description: 'Mata pelajaran dasar kejuruan.' },
    { code: 'KOMPETENSI_KEAHLIAN', name: 'Kompetensi Keahlian', description: 'Mata pelajaran spesifik sesuai jurusan/kompetensi keahlian.' },
    { code: 'PILIHAN', name: 'Pilihan', description: 'Mata pelajaran pilihan pendukung.' },
    { code: 'MUATAN_LOKAL', name: 'Muatan Lokal', description: 'Mata pelajaran muatan lokal daerah.' },
  ];

  for (const cat of categories) {
    await prisma.subjectCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    });
  }
  console.log('Created Subject Categories');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
