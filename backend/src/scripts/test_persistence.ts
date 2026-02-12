import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

async function main() {
  console.log('STARTING PERSISTENCE TEST...');

  // 1. Create/Find a test user
  const username = 'test_persistence_user_' + Date.now();
  console.log('Creating test user:', username);
  
  const user = await prisma.user.create({
    data: {
      username,
      password: 'password123',
      name: 'Test Persistence User',
      role: Role.TEACHER,
    }
  });
  
  console.log(`User ID: ${user.id}`);

  // 2. Simulate Update Payload
  const photoUrl = '/api/uploads/teachers/photos/test_photo.jpg';
  const documents = [
    { title: 'Test Doc 1', fileUrl: '/api/uploads/docs/doc1.pdf', category: 'Cert' },
    { title: 'Test Doc 2', fileUrl: '/api/uploads/docs/doc2.pdf', category: 'SK' }
  ];

  console.log('Updating user with photo and documents...');
  
  // Simulate the logic in user.controller.ts updateUser
  // We use a transaction like the controller
  try {
    const updatedUser = await prisma.$transaction(async (tx) => {
      return await tx.user.update({
        where: { id: user.id },
        data: {
          photo: photoUrl,
          documents: {
            deleteMany: {},
            create: documents
          }
        },
        include: {
          documents: true
        }
      });
    });

    console.log('Update completed.');
    console.log('Updated Photo:', updatedUser.photo);
    console.log('Updated Documents Count:', updatedUser.documents.length);

    // 3. Verify Persistence (New Fetch)
    console.log('Verifying persistence via fresh fetch...');
    const fetchedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        documents: true
      }
    });

    if (!fetchedUser) throw new Error('User not found after update');

    console.log('Fetched Photo:', fetchedUser.photo);
    console.log('Fetched Documents:', JSON.stringify(fetchedUser.documents, null, 2));

    const photoMatch = fetchedUser.photo === photoUrl;
    const docMatch = fetchedUser.documents.length === 2 && 
                     fetchedUser.documents.some(d => d.title === 'Test Doc 1') &&
                     fetchedUser.documents.some(d => d.title === 'Test Doc 2');

    if (photoMatch && docMatch) {
      console.log('✅ TEST PASSED: Data persisted correctly in Database.');
    } else {
      console.error('❌ TEST FAILED: Data mismatch.');
      if (!photoMatch) console.error('Photo mismatch');
      if (!docMatch) console.error('Documents mismatch');
    }

  } catch (error) {
    console.error('Test Error:', error);
  } finally {
    // Cleanup
    console.log('Cleaning up...');
    await prisma.teacherDocument.deleteMany({ where: { teacherId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
