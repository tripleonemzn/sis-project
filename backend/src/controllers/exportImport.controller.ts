import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { Role, Gender, StudentStatus, User } from '@prisma/client';
import prisma from '../utils/prisma';
import { asyncHandler, ApiError, ApiResponse } from '../utils/api';
import path from 'path';
import fs from 'fs';

// Helper to format date for Excel
const formatDate = (date: Date | null) => {
  if (!date) return '';
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Helper to parse date from Excel
const parseDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const exportTeachers = asyncHandler(async (req: Request, res: Response) => {
  const teachers = await prisma.user.findMany({
    where: { role: Role.TEACHER },
    orderBy: { name: 'asc' },
    include: {
        managedMajors: true
    }
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Teachers');

  worksheet.columns = [
    { header: 'Username', key: 'username', width: 20 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'NIP', key: 'nip', width: 20 },
    { header: 'NUPTK', key: 'nuptk', width: 20 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Birth Place', key: 'birthPlace', width: 20 },
    { header: 'Birth Date (YYYY-MM-DD)', key: 'birthDate', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Employee Status', key: 'employeeStatus', width: 20 },
    { header: 'PTK Type', key: 'ptkType', width: 20 },
    { header: 'Additional Duties', key: 'additionalDuties', width: 30 },
  ];

  teachers.forEach((teacher) => {
    worksheet.addRow({
      username: teacher.username,
      name: teacher.name,
      nip: teacher.nip,
      nuptk: teacher.nuptk,
      gender: teacher.gender,
      birthPlace: teacher.birthPlace,
      birthDate: formatDate(teacher.birthDate),
      email: teacher.email,
      phone: teacher.phone,
      address: teacher.address,
      employeeStatus: teacher.employeeStatus,
      ptkType: teacher.ptkType,
      additionalDuties: teacher.additionalDuties.join(', '),
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=teachers.xlsx');

  await workbook.xlsx.write(res);
});

export const importTeachers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Please upload an Excel file');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(req.file.path);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    throw new ApiError(400, 'Invalid Excel file');
  }

  const teachersToCreate: any[] = [];
  const errors: string[] = [];

  // Default password hash (smkskgb2)
  const hashedPassword = await bcrypt.hash('smkskgb2', 10);

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    // Safe access to cell values
    const getCellValue = (index: number) => {
        const cell = row.getCell(index);
        return cell.value ? cell.value.toString() : '';
    };

    const username = getCellValue(1);
    const name = getCellValue(2);
    
    if (!username || !name) {
      errors.push(`Row ${rowNumber}: Username and Name are required`);
      return;
    }

    const additionalDutiesRaw = getCellValue(13);
    const additionalDuties = additionalDutiesRaw 
        ? additionalDutiesRaw.split(',').map(d => d.trim()).filter(d => d) 
        : [];

    teachersToCreate.push({
      username,
      name,
      role: Role.TEACHER,
      password: hashedPassword,
      nip: getCellValue(3) || null,
      nuptk: getCellValue(4) || null,
      gender: getCellValue(5) === 'MALE' || getCellValue(5) === 'FEMALE' ? getCellValue(5) as Gender : null,
      birthPlace: getCellValue(6) || null,
      birthDate: parseDate(row.getCell(7).value),
      email: getCellValue(8) || null,
      phone: getCellValue(9) || null,
      address: getCellValue(10) || null,
      employeeStatus: getCellValue(11) || null,
      ptkType: getCellValue(12) || null,
      additionalDuties: additionalDuties,
    });
  });

  if (errors.length > 0) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    throw new ApiError(400, `Validation errors:\n${errors.join('\n')}`);
  }

  let createdCount = 0;
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const data of teachersToCreate) {
      const existing = await tx.user.findUnique({ where: { username: data.username } });
      if (existing) {
        // Update existing (excluding password usually, but here we keep existing password unless specified logic changes)
        // For import, usually we update fields but keep password if not explicitly set to reset.
        // Here we just update profile info.
        const { password, ...updateData } = data;
        await tx.user.update({
          where: { id: existing.id },
          data: updateData,
        });
        updatedCount++;
      } else {
        await tx.user.create({ data });
        createdCount++;
      }
    }
  });

  // Clean up uploaded file
  fs.unlinkSync(req.file.path);

  res.status(200).json(new ApiResponse(200, { created: createdCount, updated: updatedCount }, 'Teachers imported successfully'));
});

export const exportStudents = asyncHandler(async (req: Request, res: Response) => {
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT },
    orderBy: { name: 'asc' },
    include: {
      studentClass: true,
    },
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');

  worksheet.columns = [
    { header: 'NISN', key: 'nisn', width: 20 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'NIS', key: 'nis', width: 20 },
    { header: 'Class', key: 'className', width: 15 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Birth Place', key: 'birthPlace', width: 20 },
    { header: 'Birth Date (YYYY-MM-DD)', key: 'birthDate', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Father Name', key: 'fatherName', width: 25 },
    { header: 'Mother Name', key: 'motherName', width: 25 },
    { header: 'Guardian Name', key: 'guardianName', width: 25 },
    { header: 'Status', key: 'studentStatus', width: 15 },
  ];

  students.forEach((student) => {
    worksheet.addRow({
      nisn: student.nisn,
      name: student.name,
      nis: student.nis,
      className: student.studentClass?.name || '',
      gender: student.gender,
      birthPlace: student.birthPlace,
      birthDate: formatDate(student.birthDate),
      email: student.email,
      phone: student.phone,
      address: student.address,
      fatherName: student.fatherName,
      motherName: student.motherName,
      guardianName: student.guardianName,
      studentStatus: student.studentStatus,
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');

  await workbook.xlsx.write(res);
});

export const importStudents = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Please upload an Excel file');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(req.file.path);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    throw new ApiError(400, 'Invalid Excel file');
  }

  const studentsToCreate: any[] = [];
  const errors: string[] = [];
  const classMap = new Map<string, number>();

  // Pre-fetch classes to map names to IDs
  const classes = await prisma.class.findMany();
  classes.forEach(c => classMap.set(c.name.toLowerCase(), c.id));

  // Default password hash
  const hashedPassword = await bcrypt.hash('smkskgb2', 10);

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const getCellValue = (index: number) => {
        const cell = row.getCell(index);
        return cell.value ? cell.value.toString() : '';
    };

    const nisn = getCellValue(1);
    const name = getCellValue(2);

    if (!nisn || !name) {
      errors.push(`Row ${rowNumber}: NISN and Name are required`);
      return;
    }

    const className = getCellValue(4);
    let classId = null;
    if (className) {
        const id = classMap.get(className.toLowerCase());
        if (id) classId = id;
        else errors.push(`Row ${rowNumber}: Class '${className}' not found`);
    }

    studentsToCreate.push({
      username: nisn, // NISN is username for students
      nisn,
      name,
      role: Role.STUDENT,
      password: hashedPassword,
      nis: getCellValue(3) || null,
      classId: classId,
      gender: getCellValue(5) === 'MALE' || getCellValue(5) === 'FEMALE' ? getCellValue(5) as Gender : null,
      birthPlace: getCellValue(6) || null,
      birthDate: parseDate(row.getCell(7).value),
      email: getCellValue(8) || null,
      phone: getCellValue(9) || null,
      address: getCellValue(10) || null,
      fatherName: getCellValue(11) || null,
      motherName: getCellValue(12) || null,
      guardianName: getCellValue(13) || null,
      studentStatus: (getCellValue(14) as StudentStatus) || StudentStatus.ACTIVE,
    });
  });

  if (errors.length > 0) {
    fs.unlinkSync(req.file.path);
    throw new ApiError(400, `Validation errors:\n${errors.join('\n')}`);
  }

  let createdCount = 0;
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const data of studentsToCreate) {
      const existing = await tx.user.findUnique({ where: { username: data.username } });
      if (existing) {
        const { password, ...updateData } = data;
        await tx.user.update({
          where: { id: existing.id },
          data: updateData,
        });
        updatedCount++;
      } else {
        await tx.user.create({ data });
        createdCount++;
      }
    }
  });

  fs.unlinkSync(req.file.path);
  res.status(200).json(new ApiResponse(200, { created: createdCount, updated: updatedCount }, 'Students imported successfully'));
});

export const exportParents = asyncHandler(async (req: Request, res: Response) => {
    const parents = await prisma.user.findMany({
      where: { role: Role.PARENT },
      orderBy: { name: 'asc' },
      include: {
        children: {
            select: { nisn: true }
        },
      },
    });
  
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Parents');
  
    worksheet.columns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Children NISNs (comma separated)', key: 'children', width: 40 },
    ];
  
    parents.forEach((parent) => {
      worksheet.addRow({
        username: parent.username,
        name: parent.name,
        email: parent.email,
        phone: parent.phone,
        address: parent.address,
        children: parent.children.map(c => c.nisn).join(', '),
      });
    });
  
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=parents.xlsx');
  
    await workbook.xlsx.write(res);
  });
  
  export const importParents = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, 'Please upload an Excel file');
    }
  
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const worksheet = workbook.getWorksheet(1);
  
    if (!worksheet) {
      throw new ApiError(400, 'Invalid Excel file');
    }
  
    const parentsToCreate: any[] = [];
    const errors: string[] = [];
  
    // Default password hash
    const hashedPassword = await bcrypt.hash('smkskgb2', 10);
  
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
  
      const getCellValue = (index: number) => {
          const cell = row.getCell(index);
          return cell.value ? cell.value.toString() : '';
      };
  
      const username = getCellValue(1);
      const name = getCellValue(2);
  
      if (!username || !name) {
        errors.push(`Row ${rowNumber}: Username and Name are required`);
        return;
      }

      const childrenNISNsRaw = getCellValue(6);
      const childrenNISNs = childrenNISNsRaw 
        ? childrenNISNsRaw.split(',').map(n => n.trim()).filter(n => n)
        : [];
  
      parentsToCreate.push({
        username,
        name,
        role: Role.PARENT,
        password: hashedPassword,
        email: getCellValue(3) || null,
        phone: getCellValue(4) || null,
        address: getCellValue(5) || null,
        childrenNISNs
      });
    });
  
    if (errors.length > 0) {
      fs.unlinkSync(req.file.path);
      throw new ApiError(400, `Validation errors:\n${errors.join('\n')}`);
    }
  
    let createdCount = 0;
    let updatedCount = 0;
  
    await prisma.$transaction(async (tx) => {
      for (const data of parentsToCreate) {
        const { childrenNISNs, ...parentData } = data;

        // Find children IDs
        let childrenIds: { id: number }[] = [];
        if (childrenNISNs.length > 0) {
             const children = await tx.user.findMany({
                 where: { role: Role.STUDENT, nisn: { in: childrenNISNs } },
                 select: { id: true }
             });
             childrenIds = children;
             // Note: We are not failing if some NISNs are not found, but we could warn.
        }

        const existing = await tx.user.findUnique({ where: { username: parentData.username } });
        
        if (existing) {
          const { password, ...updateData } = parentData;
          await tx.user.update({
            where: { id: existing.id },
            data: {
                ...updateData,
                children: {
                    set: childrenIds // Replace existing children or merge? 'set' replaces.
                }
            },
          });
          updatedCount++;
        } else {
          await tx.user.create({ 
              data: {
                  ...parentData,
                  children: {
                      connect: childrenIds
                  }
              } 
            });
          createdCount++;
        }
      }
    });
  
    fs.unlinkSync(req.file.path);
    res.status(200).json(new ApiResponse(200, { created: createdCount, updated: updatedCount }, 'Parents imported successfully'));
  });
