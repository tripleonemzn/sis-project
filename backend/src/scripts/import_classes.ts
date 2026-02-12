
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(__dirname, '../../../etc/DATABASE-SIS-KGB2.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetName = 'Walikelas';
    const sheet = workbook.getWorksheet(sheetName);

    if (!sheet) {
        console.error(`Sheet '${sheetName}' not found`);
        process.exit(1);
    }

    // Get Active Academic Year
    const academicYear = await prisma.academicYear.findFirst({
        where: { isActive: true }
    });

    if (!academicYear) {
        console.error('No active academic year found.');
        process.exit(1);
    }

    console.log(`Using Academic Year: ${academicYear.name} (ID: ${academicYear.id})`);

    // Get Majors map
    const majors = await prisma.major.findMany();
    const majorMap: { [key: string]: number } = {};
    majors.forEach(m => {
        majorMap[m.code] = m.id;
    });
    console.log('Majors:', majorMap);

    let successCount = 0;
    let failCount = 0;

    // Process rows starting from row 2
    const rowCount = sheet.rowCount;
    console.log(`Found ${rowCount - 1} rows to process.`);

    for (let i = 2; i <= rowCount; i++) {
        const row = sheet.getRow(i);
        const className = row.getCell(1).value?.toString().trim(); // Column A: Kelas
        const teacherName = row.getCell(2).value?.toString().trim(); // Column B: Wali Kelas

        if (!className) continue;

        try {
            // Determine Level
            const parts = className.split(' ');
            const level = parts[0]; // X, XI, XII

            // Determine Major
            let majorId: number | null = null;
            if (className.includes('AK')) majorId = majorMap['AK'];
            else if (className.includes('MP')) majorId = majorMap['MP'];
            else if (className.includes('TKJ')) majorId = majorMap['TKJ'];
            else if (className.includes('MAL')) majorId = majorMap['MAL'];

            if (!majorId) {
                console.warn(`Could not determine major for class '${className}'. Skipping.`);
                failCount++;
                continue;
            }

            // Find Teacher
            let teacherId: number | null = null;
            if (teacherName) {
                // Try exact match first
                let teacher = await prisma.user.findFirst({
                    where: {
                        name: {
                            equals: teacherName,
                            mode: 'insensitive' // Case insensitive
                        },
                        role: 'TEACHER'
                    }
                });

                if (!teacher) {
                    // Try partial match or handle "S.Pd" etc.
                    // Maybe the Excel name is "Name, Title" but DB is "Name" or vice versa.
                    // Let's try matching startsWith
                    teacher = await prisma.user.findFirst({
                        where: {
                            name: {
                                contains: teacherName.split(',')[0], // Try name without title
                                mode: 'insensitive'
                            },
                            role: 'TEACHER'
                        }
                    });
                }

                if (teacher) {
                    teacherId = teacher.id;
                } else {
                    console.warn(`Teacher '${teacherName}' not found for class '${className}'.`);
                }
            }

            // Create or Update Class
            // Check if class exists for this academic year
            const existingClass = await prisma.class.findFirst({
                where: {
                    name: className,
                    academicYearId: academicYear.id
                }
            });

            if (existingClass) {
                await prisma.class.update({
                    where: { id: existingClass.id },
                    data: {
                        level: level,
                        majorId: majorId,
                        teacherId: teacherId,
                    }
                });
                console.log(`Updated class: ${className}`);
            } else {
                await prisma.class.create({
                    data: {
                        name: className,
                        level: level,
                        majorId: majorId,
                        academicYearId: academicYear.id,
                        teacherId: teacherId
                    }
                });
                console.log(`Created class: ${className}`);
            }

            successCount++;

        } catch (error) {
            console.error(`Error processing row ${i} (${className}):`, error);
            failCount++;
        }
    }

    console.log(`\nImport Finished.`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
