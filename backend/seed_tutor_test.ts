
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedTutorTest() {
  console.log('Starting seed for Tutor Test...');

  const academicYearId = 4; // 2025/2026
  const ekskulId = 4; // PRAMUKA
  const studentId = 956; // Abdul Rachman

  // 1. Create Tutor User
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  // Check if exists first
  let tutor = await prisma.user.findUnique({ where: { username: 'tutor_pramuka_test' } });
  
  if (!tutor) {
    tutor = await prisma.user.create({
      data: {
        username: 'tutor_pramuka_test',
        password: hashedPassword,
        name: 'Pembina Pramuka Test',
        role: Role.EXTRACURRICULAR_TUTOR,
        email: 'tutor.test@example.com',
        nis: 'TUTOR001'
      }
    });
    console.log('Created tutor user: tutor_pramuka_test');
  } else {
    console.log('Tutor user already exists: tutor_pramuka_test');
  }

  // 2. Assign Tutor to Ekskul
  const assignment = await prisma.ekstrakurikulerTutorAssignment.upsert({
    where: {
      id: 999999 // dummy ID to force create or find unique constraint if possible (schema doesn't have unique constraint on compound fields easily accessible here without knowing logic, so I'll use findFirst)
    },
    update: {},
    create: {
      tutorId: tutor.id,
      ekskulId: ekskulId,
      academicYearId: academicYearId,
      isActive: true
    }
  }).catch(async () => {
      // If upsert fails (likely due to ID), try findFirst then create
      const existing = await prisma.ekstrakurikulerTutorAssignment.findFirst({
          where: {
              tutorId: tutor!.id,
              ekskulId: ekskulId,
              academicYearId: academicYearId
          }
      });
      
      if (!existing) {
          return await prisma.ekstrakurikulerTutorAssignment.create({
              data: {
                  tutorId: tutor!.id,
                  ekskulId: ekskulId,
                  academicYearId: academicYearId,
                  isActive: true
              }
          });
      }
      return existing;
  });
  console.log('Assigned tutor to PRAMUKA');

  // 3. Enroll Student to Ekskul (if not exists)
  const enrollment = await prisma.ekstrakurikulerEnrollment.findFirst({
    where: {
      studentId: studentId,
      ekskulId: ekskulId,
      academicYearId: academicYearId
    }
  });

  if (!enrollment) {
    await prisma.ekstrakurikulerEnrollment.create({
      data: {
        studentId: studentId,
        ekskulId: ekskulId,
        academicYearId: academicYearId
      }
    });
    console.log('Enrolled student Abdul Rachman to PRAMUKA');
  } else {
    console.log('Student already enrolled in PRAMUKA');
  }

  console.log('\n--- CREDENTIALS ---');
  console.log('Username: tutor_pramuka_test');
  console.log('Password: password123');
  console.log('-------------------');
}

seedTutorTest()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
