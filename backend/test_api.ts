
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_sekolah_aman_2024';

async function main() {
  // 1. Find a teacher
  const teacher = await prisma.user.findFirst({
    where: { role: 'TEACHER' }
  });

  if (!teacher) {
    console.error('No teacher found');
    return;
  }

  console.log(`Found teacher: ${teacher.username} (ID: ${teacher.id})`);

  // 2. Generate Token
  const token = jwt.sign({ id: teacher.id, role: teacher.role }, JWT_SECRET, { expiresIn: '1h' });
  console.log('Generated Token:', token.substring(0, 20) + '...');

  // 3. Call API
  try {
    const response = await axios.get('http://localhost:3000/api/academic-years/active', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('API Response Status:', response.status);
    console.log('API Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('API Error:', error.response?.status, error.response?.data || error.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
