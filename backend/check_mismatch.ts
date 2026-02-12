
import prisma from './src/utils/prisma';

async function main() {
    console.log('Checking for schedules with examType SBTS, SAS, SAT...');
    
    const schedules = await prisma.examSchedule.findMany({
        where: {
            examType: { in: ['SBTS', 'SAS', 'SAT'] }
        },
        include: {
            packet: {
                include: { subject: true }
            },
            subject: true,
            class: true
        }
    });

    console.log(`Found ${schedules.length} schedules.`);

    const mismatches = schedules.filter(s => {
        if (!s.packet) return false; // If no packet, we rely on schedule type
        return s.packet.type !== 'SBTS' && s.packet.type !== 'SAS' && s.packet.type !== 'SAT';
    });

    console.log(`\nFound ${mismatches.length} potential mismatches (Packet type is not SBTS/SAS/SAT):`);
    
    mismatches.forEach(s => {
        console.log(`- Schedule ID: ${s.id}`);
        console.log(`  Schedule Type: ${s.examType}`);
        console.log(`  Packet Type: ${s.packet?.type}`);
        console.log(`  Subject: ${s.subject?.name || s.packet?.subject?.name}`);
        console.log(`  Class: ${s.class.name}`);
        console.log(`  Created At: ${s.createdAt}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
