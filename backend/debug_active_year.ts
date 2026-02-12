
import axios from 'axios';

async function testActiveYear() {
  try {
    // We need a token. I'll assume I can't easily get one without login.
    // But I can run this script via ts-node within the project context if I mock the request or use the controller directly.
    // Better: use the controller directly.
    
    console.log('Testing getActiveAcademicYear controller...');
    
    const { getActiveAcademicYear } = require('./src/controllers/academicYear.controller');
    const { prisma } = require('./src/utils/prisma'); // Adjust path if needed
    
    // Mock Request and Response
    const req = {};
    const res = {
      status: (code: any) => ({
        json: (data: any) => {
          console.log(`Response ${code}:`, JSON.stringify(data, null, 2));
          return data;
        }
      })
    };
    
    // Check if prisma is connected
    // We need to initialize prisma client if it's not exported ready-to-use
    // In this project it seems exported as default from utils/prisma
    
    await getActiveAcademicYear(req, res);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testActiveYear();
