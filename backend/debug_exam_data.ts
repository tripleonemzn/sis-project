
import prisma from './src/utils/prisma';

async function main() {
    console.log('Searching for user KGB2G071...');
    const user = await prisma.user.findUnique({
        where: { username: 'KGB2G071' }
    });

    if (!user) {
        console.log('User not found by username. Trying to search by name or other fields if needed.');
        return;
    }

    console.log(`Found user: ${user.name} (ID: ${user.id})`);

    // Find Packets
    console.log('\nSearching for Exam Packets by this user...');
    const packets = await prisma.examPacket.findMany({
        where: { 
            authorId: user.id,
            // subject: { name: { contains: 'Network', mode: 'insensitive' } } 
        },
        include: { subject: true }
    });

    console.log(`Found ${packets.length} packets.`);
    packets.forEach(p => {
        console.log(`- Packet ID: ${p.id}, Title: ${p.title}, Type: ${p.type}, Subject: ${p.subject.name}`);
    });

    // Find Schedules for these packets
    if (packets.length > 0) {
        const packetIds = packets.map(p => p.id);
        console.log(`\nSearching for Schedules linked to these packets (IDs: ${packetIds.join(', ')})...`);
        
        const schedules = await prisma.examSchedule.findMany({
            where: { packetId: { in: packetIds } },
            include: { packet: true, subject: true, class: true }
        });

        console.log(`Found ${schedules.length} schedules.`);
        schedules.forEach(s => {
            console.log(`- Schedule ID: ${s.id}, Type (in Schedule): ${s.examType}, Packet Type: ${s.packet?.type}, Class: ${s.class.name}, Time: ${s.startTime}`);
        });
    }

    // Also search for Schedules that might have the subject but no packet, or different packet
    console.log('\nSearching for ALL Schedules with subject "Network Client Server" (or similar)...');
    const subjectSchedules = await prisma.examSchedule.findMany({
        where: {
            subject: { name: { contains: 'Network', mode: 'insensitive' } }
        },
        include: { packet: true, subject: true, class: true }
    });

    console.log(`Found ${subjectSchedules.length} schedules with subject matching "Network".`);
    subjectSchedules.forEach(s => {
        console.log(`- Schedule ID: ${s.id}, Type (in Schedule): ${s.examType}, Packet Type: ${s.packet?.type}, Subject: ${s.subject?.name}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
