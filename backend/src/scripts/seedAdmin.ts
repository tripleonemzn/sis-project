import prisma from '../utils/prisma';
import bcrypt from 'bcryptjs';
import { Role, VerificationStatus } from '@prisma/client';

async function main() {
  const username = 'admin';
  const passwordPlain = 'admin123';

  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { verificationStatus: VerificationStatus.VERIFIED },
    });
    console.log('Admin user verified:', existingAdmin.username);
    return;
  }

  const hashed = await bcrypt.hash(passwordPlain, 10);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      name: 'Administrator',
      role: Role.ADMIN,
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });
  console.log('Seeded and verified admin user:', user.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
