
import prisma from './src/utils/prisma';

async function main() {
    console.log("Running reproduction query...");

    // 1. Check the specific schedules again with raw values
    const schedules = await prisma.examSchedule.findMany({
        where: {
            packet: { authorId: 23 } // KGB2G071
        },
        select: {
            id: true,
            examType: true,
            packet: {
                select: {
                    type: true,
                    title: true
                }
            }
        }
    });
    console.log("Raw Schedules for user 23:", JSON.stringify(schedules, null, 2));

    // 2. Simulate the query from ExamProctorManagementPage (Wakasek access)
    // Wakasek does NOT hit the OR block.
    // Query: where examType = 'SBTS'
    const sbtsSchedules = await prisma.examSchedule.findMany({
        where: {
            examType: 'SBTS'
        },
        include: {
            packet: {
                select: {
                    title: true,
                    type: true,
                    authorId: true
                }
            }
        }
    });

    const leakedSchedule = sbtsSchedules.find(s => s.packet?.authorId === 23);
    if (leakedSchedule) {
        console.log("!!! FOUND LEAKED SCHEDULE IN SBTS QUERY !!!");
        console.log(JSON.stringify(leakedSchedule, null, 2));
    } else {
        console.log("No schedules for user 23 found in SBTS query.");
    }

    // 3. Simulate with Teacher Access (OR block)
    // This is relevant if the user viewing it is the teacher themselves
    // Query: where examType = 'SBTS' AND (authorId = 23 OR ...)
    const teacherSchedules = await prisma.examSchedule.findMany({
        where: {
            examType: 'SBTS',
            OR: [
                { packet: { authorId: 23 } }
            ]
        },
        include: {
            packet: { select: { type: true } }
        }
    });

    console.log("Teacher Schedules (SBTS + Author):", JSON.stringify(teacherSchedules, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
