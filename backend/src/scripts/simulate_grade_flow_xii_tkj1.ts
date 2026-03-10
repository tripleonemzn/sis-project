import {
  GradeComponentType,
  GradeEntryMode,
  ReportComponentSlot,
  ScoreEntrySourceType,
  Semester,
} from '@prisma/client'
import prisma from '../utils/prisma'
import { syncReportGrade } from '../controllers/grade.controller'

const CLASS_NAME = 'XII TKJ 1'
const SEMESTER: Semester = Semester.EVEN
const SIM_PREFIX = '[SIMULASI NILAI]'
const SIM_SUBJECT_CODE = 'SIM_XIITKJ1_2026'
const SIM_SUBJECT_NAME = `${SIM_PREFIX} Alur Formatif-SBTS-SAT XII TKJ 1`

const COMPONENT_CODES = {
  formative: 'SIM_XIITKJ1_FORMATIF',
  midterm: 'SIM_XIITKJ1_SBTS',
  finalEven: 'SIM_XIITKJ1_SAT',
}

const PROGRAM_CODES = {
  formative: 'SIM_FMT_XIITKJ1',
  midterm: 'SIM_SBTS_XIITKJ1',
  finalEven: 'SIM_SAT_XIITKJ1',
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

async function main() {
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  })
  if (!activeYear) {
    throw new Error('Tahun ajaran aktif tidak ditemukan.')
  }

  const targetClass = await prisma.class.findFirst({
    where: { name: CLASS_NAME },
    select: { id: true, name: true },
  })
  if (!targetClass) {
    throw new Error(`Kelas ${CLASS_NAME} tidak ditemukan.`)
  }

  const driverAssignment = await prisma.teacherAssignment.findFirst({
    where: {
      academicYearId: activeYear.id,
      classId: targetClass.id,
    },
    orderBy: [{ id: 'asc' }],
    select: {
      teacherId: true,
      kkm: true,
      teacher: {
        select: { id: true, name: true, username: true },
      },
    },
  })
  if (!driverAssignment) {
    throw new Error(`Penugasan guru untuk kelas ${CLASS_NAME} tidak ditemukan.`)
  }

  const simSubject = await prisma.subject.upsert({
    where: { code: SIM_SUBJECT_CODE },
    update: {
      name: SIM_SUBJECT_NAME,
      description: `${SIM_PREFIX} Dipakai untuk uji alur nilai dinamis.`,
    },
    create: {
      code: SIM_SUBJECT_CODE,
      name: SIM_SUBJECT_NAME,
      description: `${SIM_PREFIX} Dipakai untuk uji alur nilai dinamis.`,
    },
    select: { id: true, code: true, name: true },
  })

  await prisma.teacherAssignment.upsert({
    where: {
      id: (
        await prisma.teacherAssignment.findFirst({
          where: {
            teacherId: driverAssignment.teacherId,
            classId: targetClass.id,
            subjectId: simSubject.id,
            academicYearId: activeYear.id,
          },
          select: { id: true },
        })
      )?.id ?? 0,
    },
    update: {
      kkm: driverAssignment.kkm || 75,
    },
    create: {
      teacherId: driverAssignment.teacherId,
      classId: targetClass.id,
      subjectId: simSubject.id,
      academicYearId: activeYear.id,
      kkm: driverAssignment.kkm || 75,
    },
  })

  await prisma.examGradeComponent.upsert({
    where: {
      academicYearId_code: { academicYearId: activeYear.id, code: COMPONENT_CODES.formative },
    },
    update: {
      label: `${SIM_PREFIX} Formatif`,
      type: GradeComponentType.FORMATIVE,
      typeCode: 'FORMATIVE',
      entryMode: GradeEntryMode.NF_SERIES,
      entryModeCode: 'NF_SERIES',
      reportSlot: ReportComponentSlot.FORMATIF,
      reportSlotCode: 'FORMATIF',
      includeInFinalScore: true,
      isActive: true,
      displayOrder: 9101,
      description: `${SIM_PREFIX} Komponen formatif bertahap.`,
    },
    create: {
      academicYearId: activeYear.id,
      code: COMPONENT_CODES.formative,
      label: `${SIM_PREFIX} Formatif`,
      type: GradeComponentType.FORMATIVE,
      typeCode: 'FORMATIVE',
      entryMode: GradeEntryMode.NF_SERIES,
      entryModeCode: 'NF_SERIES',
      reportSlot: ReportComponentSlot.FORMATIF,
      reportSlotCode: 'FORMATIF',
      includeInFinalScore: true,
      isActive: true,
      displayOrder: 9101,
      description: `${SIM_PREFIX} Komponen formatif bertahap.`,
    },
  })

  await prisma.examGradeComponent.upsert({
    where: {
      academicYearId_code: { academicYearId: activeYear.id, code: COMPONENT_CODES.midterm },
    },
    update: {
      label: `${SIM_PREFIX} SBTS`,
      type: GradeComponentType.MIDTERM,
      typeCode: 'MIDTERM',
      entryMode: GradeEntryMode.SINGLE_SCORE,
      entryModeCode: 'SINGLE_SCORE',
      reportSlot: ReportComponentSlot.SBTS,
      reportSlotCode: 'SBTS',
      includeInFinalScore: true,
      isActive: true,
      displayOrder: 9102,
      description: `${SIM_PREFIX} Komponen tengah semester.`,
    },
    create: {
      academicYearId: activeYear.id,
      code: COMPONENT_CODES.midterm,
      label: `${SIM_PREFIX} SBTS`,
      type: GradeComponentType.MIDTERM,
      typeCode: 'MIDTERM',
      entryMode: GradeEntryMode.SINGLE_SCORE,
      entryModeCode: 'SINGLE_SCORE',
      reportSlot: ReportComponentSlot.SBTS,
      reportSlotCode: 'SBTS',
      includeInFinalScore: true,
      isActive: true,
      displayOrder: 9102,
      description: `${SIM_PREFIX} Komponen tengah semester.`,
    },
  })

  await prisma.examGradeComponent.upsert({
    where: {
      academicYearId_code: { academicYearId: activeYear.id, code: COMPONENT_CODES.finalEven },
    },
    update: {
      label: `${SIM_PREFIX} SAT`,
      type: GradeComponentType.FINAL,
      typeCode: 'FINAL',
      entryMode: GradeEntryMode.SINGLE_SCORE,
      entryModeCode: 'SINGLE_SCORE',
      reportSlot: ReportComponentSlot.SAS,
      reportSlotCode: 'SAT',
      includeInFinalScore: true,
      isActive: true,
      displayOrder: 9103,
      description: `${SIM_PREFIX} Komponen akhir semester genap.`,
    },
    create: {
      academicYearId: activeYear.id,
      code: COMPONENT_CODES.finalEven,
      label: `${SIM_PREFIX} SAT`,
      type: GradeComponentType.FINAL,
      typeCode: 'FINAL',
      entryMode: GradeEntryMode.SINGLE_SCORE,
      entryModeCode: 'SINGLE_SCORE',
      reportSlot: ReportComponentSlot.SAS,
      reportSlotCode: 'SAT',
      includeInFinalScore: true,
      isActive: true,
      displayOrder: 9103,
      description: `${SIM_PREFIX} Komponen akhir semester genap.`,
    },
  })

  await prisma.examProgramConfig.upsert({
    where: { academicYearId_code: { academicYearId: activeYear.id, code: PROGRAM_CODES.formative } },
    update: {
      baseTypeCode: 'FORMATIF',
      baseType: 'FORMATIF',
      gradeComponentType: GradeComponentType.FORMATIVE,
      gradeComponentTypeCode: 'FORMATIVE',
      gradeComponentCode: COMPONENT_CODES.formative,
      gradeComponentLabel: `${SIM_PREFIX} Formatif`,
      gradeEntryMode: GradeEntryMode.NF_SERIES,
      gradeEntryModeCode: 'NF_SERIES',
      displayLabel: `${SIM_PREFIX} Formatif`,
      shortLabel: 'SIM-FMT',
      description: `${SIM_PREFIX} Program ujian formatif`,
      fixedSemester: null,
      displayOrder: 9101,
      isActive: true,
      showOnTeacherMenu: false,
      showOnStudentMenu: false,
    },
    create: {
      academicYearId: activeYear.id,
      code: PROGRAM_CODES.formative,
      baseTypeCode: 'FORMATIF',
      baseType: 'FORMATIF',
      gradeComponentType: GradeComponentType.FORMATIVE,
      gradeComponentTypeCode: 'FORMATIVE',
      gradeComponentCode: COMPONENT_CODES.formative,
      gradeComponentLabel: `${SIM_PREFIX} Formatif`,
      gradeEntryMode: GradeEntryMode.NF_SERIES,
      gradeEntryModeCode: 'NF_SERIES',
      displayLabel: `${SIM_PREFIX} Formatif`,
      shortLabel: 'SIM-FMT',
      description: `${SIM_PREFIX} Program ujian formatif`,
      fixedSemester: null,
      displayOrder: 9101,
      isActive: true,
      showOnTeacherMenu: false,
      showOnStudentMenu: false,
    },
  })

  await prisma.examProgramConfig.upsert({
    where: { academicYearId_code: { academicYearId: activeYear.id, code: PROGRAM_CODES.midterm } },
    update: {
      baseTypeCode: 'SBTS',
      baseType: 'SBTS',
      gradeComponentType: GradeComponentType.MIDTERM,
      gradeComponentTypeCode: 'MIDTERM',
      gradeComponentCode: COMPONENT_CODES.midterm,
      gradeComponentLabel: `${SIM_PREFIX} SBTS`,
      gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
      gradeEntryModeCode: 'SINGLE_SCORE',
      displayLabel: `${SIM_PREFIX} SBTS`,
      shortLabel: 'SIM-SBTS',
      description: `${SIM_PREFIX} Program ujian tengah semester`,
      fixedSemester: null,
      displayOrder: 9102,
      isActive: true,
      showOnTeacherMenu: false,
      showOnStudentMenu: false,
    },
    create: {
      academicYearId: activeYear.id,
      code: PROGRAM_CODES.midterm,
      baseTypeCode: 'SBTS',
      baseType: 'SBTS',
      gradeComponentType: GradeComponentType.MIDTERM,
      gradeComponentTypeCode: 'MIDTERM',
      gradeComponentCode: COMPONENT_CODES.midterm,
      gradeComponentLabel: `${SIM_PREFIX} SBTS`,
      gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
      gradeEntryModeCode: 'SINGLE_SCORE',
      displayLabel: `${SIM_PREFIX} SBTS`,
      shortLabel: 'SIM-SBTS',
      description: `${SIM_PREFIX} Program ujian tengah semester`,
      fixedSemester: null,
      displayOrder: 9102,
      isActive: true,
      showOnTeacherMenu: false,
      showOnStudentMenu: false,
    },
  })

  await prisma.examProgramConfig.upsert({
    where: { academicYearId_code: { academicYearId: activeYear.id, code: PROGRAM_CODES.finalEven } },
    update: {
      baseTypeCode: 'SAT',
      baseType: 'SAT',
      gradeComponentType: GradeComponentType.FINAL,
      gradeComponentTypeCode: 'FINAL',
      gradeComponentCode: COMPONENT_CODES.finalEven,
      gradeComponentLabel: `${SIM_PREFIX} SAT`,
      gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
      gradeEntryModeCode: 'SINGLE_SCORE',
      displayLabel: `${SIM_PREFIX} SAT`,
      shortLabel: 'SIM-SAT',
      description: `${SIM_PREFIX} Program ujian akhir semester genap`,
      fixedSemester: Semester.EVEN,
      displayOrder: 9103,
      isActive: true,
      showOnTeacherMenu: false,
      showOnStudentMenu: false,
    },
    create: {
      academicYearId: activeYear.id,
      code: PROGRAM_CODES.finalEven,
      baseTypeCode: 'SAT',
      baseType: 'SAT',
      gradeComponentType: GradeComponentType.FINAL,
      gradeComponentTypeCode: 'FINAL',
      gradeComponentCode: COMPONENT_CODES.finalEven,
      gradeComponentLabel: `${SIM_PREFIX} SAT`,
      gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
      gradeEntryModeCode: 'SINGLE_SCORE',
      displayLabel: `${SIM_PREFIX} SAT`,
      shortLabel: 'SIM-SAT',
      description: `${SIM_PREFIX} Program ujian akhir semester genap`,
      fixedSemester: Semester.EVEN,
      displayOrder: 9103,
      isActive: true,
      showOnTeacherMenu: false,
      showOnStudentMenu: false,
    },
  })

  const students = await prisma.user.findMany({
    where: {
      classId: targetClass.id,
      role: 'STUDENT',
    },
    select: {
      id: true,
      name: true,
      nisn: true,
      nis: true,
    },
    orderBy: [{ name: 'asc' }],
  })

  if (!students.length) {
    throw new Error(`Tidak ada siswa aktif di kelas ${CLASS_NAME}.`)
  }

  const sourcePrefix = `simflow:${activeYear.id}:${targetClass.id}:${simSubject.id}:`

  await prisma.studentScoreEntry.deleteMany({
    where: {
      sourceKey: { startsWith: sourcePrefix },
    },
  })

  await prisma.reportGrade.deleteMany({
    where: {
      academicYearId: activeYear.id,
      subjectId: simSubject.id,
      semester: SEMESTER,
      studentId: { in: students.map((student) => student.id) },
    },
  })

  const snapshots: Array<{
    studentId: number
    studentName: string
    nfValues: number[]
    nfAvg: number
    sbts: number
    sat: number
  }> = []

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index]
    const base = 72 + (index % 8) * 2
    const nfValues = [
      clampScore(base + 3),
      clampScore(base + 5),
      clampScore(base + 4),
      clampScore(base + 6),
    ]
    const sbts = clampScore(base + 7)
    const sat = clampScore(base + 8)

    for (let nfIndex = 0; nfIndex < nfValues.length; nfIndex += 1) {
      const value = nfValues[nfIndex]
      await prisma.studentScoreEntry.upsert({
        where: {
          sourceKey: `${sourcePrefix}${student.id}:nf:${nfIndex + 1}`,
        },
        update: {
          studentId: student.id,
          subjectId: simSubject.id,
          academicYearId: activeYear.id,
          semester: SEMESTER,
          componentCode: COMPONENT_CODES.formative,
          componentType: GradeComponentType.FORMATIVE,
          componentTypeCode: 'FORMATIVE',
          reportSlot: ReportComponentSlot.FORMATIF,
          reportSlotCode: 'FORMATIF',
          score: value,
          rawScore: value,
          maxScore: 100,
          sourceType: ScoreEntrySourceType.IMPORT,
          metadata: {
            source: 'simulation',
            className: targetClass.name,
            stage: 'FORMATIF',
            order: nfIndex + 1,
          },
          recordedAt: new Date(),
        },
        create: {
          studentId: student.id,
          subjectId: simSubject.id,
          academicYearId: activeYear.id,
          semester: SEMESTER,
          componentCode: COMPONENT_CODES.formative,
          componentType: GradeComponentType.FORMATIVE,
          componentTypeCode: 'FORMATIVE',
          reportSlot: ReportComponentSlot.FORMATIF,
          reportSlotCode: 'FORMATIF',
          score: value,
          rawScore: value,
          maxScore: 100,
          sourceType: ScoreEntrySourceType.IMPORT,
          sourceKey: `${sourcePrefix}${student.id}:nf:${nfIndex + 1}`,
          metadata: {
            source: 'simulation',
            className: targetClass.name,
            stage: 'FORMATIF',
            order: nfIndex + 1,
          },
        },
      })
    }

    await prisma.studentScoreEntry.upsert({
      where: {
        sourceKey: `${sourcePrefix}${student.id}:sbts`,
      },
      update: {
        studentId: student.id,
        subjectId: simSubject.id,
        academicYearId: activeYear.id,
        semester: SEMESTER,
        componentCode: COMPONENT_CODES.midterm,
        componentType: GradeComponentType.MIDTERM,
        componentTypeCode: 'MIDTERM',
        reportSlot: ReportComponentSlot.SBTS,
        reportSlotCode: 'SBTS',
        score: sbts,
        rawScore: sbts,
        maxScore: 100,
        sourceType: ScoreEntrySourceType.IMPORT,
        metadata: {
          source: 'simulation',
          className: targetClass.name,
          stage: 'SBTS',
        },
        recordedAt: new Date(),
      },
      create: {
        studentId: student.id,
        subjectId: simSubject.id,
        academicYearId: activeYear.id,
        semester: SEMESTER,
        componentCode: COMPONENT_CODES.midterm,
        componentType: GradeComponentType.MIDTERM,
        componentTypeCode: 'MIDTERM',
        reportSlot: ReportComponentSlot.SBTS,
        reportSlotCode: 'SBTS',
        score: sbts,
        rawScore: sbts,
        maxScore: 100,
        sourceType: ScoreEntrySourceType.IMPORT,
        sourceKey: `${sourcePrefix}${student.id}:sbts`,
        metadata: {
          source: 'simulation',
          className: targetClass.name,
          stage: 'SBTS',
        },
      },
    })

    await prisma.studentScoreEntry.upsert({
      where: {
        sourceKey: `${sourcePrefix}${student.id}:sat`,
      },
      update: {
        studentId: student.id,
        subjectId: simSubject.id,
        academicYearId: activeYear.id,
        semester: SEMESTER,
        componentCode: COMPONENT_CODES.finalEven,
        componentType: GradeComponentType.FINAL,
        componentTypeCode: 'FINAL',
        reportSlot: ReportComponentSlot.SAS,
        reportSlotCode: 'SAT',
        score: sat,
        rawScore: sat,
        maxScore: 100,
        sourceType: ScoreEntrySourceType.IMPORT,
        metadata: {
          source: 'simulation',
          className: targetClass.name,
          stage: 'SAT',
        },
        recordedAt: new Date(),
      },
      create: {
        studentId: student.id,
        subjectId: simSubject.id,
        academicYearId: activeYear.id,
        semester: SEMESTER,
        componentCode: COMPONENT_CODES.finalEven,
        componentType: GradeComponentType.FINAL,
        componentTypeCode: 'FINAL',
        reportSlot: ReportComponentSlot.SAS,
        reportSlotCode: 'SAT',
        score: sat,
        rawScore: sat,
        maxScore: 100,
        sourceType: ScoreEntrySourceType.IMPORT,
        sourceKey: `${sourcePrefix}${student.id}:sat`,
        metadata: {
          source: 'simulation',
          className: targetClass.name,
          stage: 'SAT',
        },
      },
    })

    await syncReportGrade(student.id, simSubject.id, activeYear.id, SEMESTER)

    snapshots.push({
      studentId: student.id,
      studentName: student.name,
      nfValues,
      nfAvg: avg(nfValues),
      sbts,
      sat,
    })
  }

  const reportRows = await prisma.reportGrade.findMany({
    where: {
      academicYearId: activeYear.id,
      subjectId: simSubject.id,
      semester: SEMESTER,
      studentId: { in: students.map((student) => student.id) },
    },
    select: {
      studentId: true,
      formatifScore: true,
      sbtsScore: true,
      sasScore: true,
      slotScores: true,
      finalScore: true,
      predicate: true,
    },
  })

  const reportByStudent = new Map(reportRows.map((row) => [row.studentId, row]))

  const preview = snapshots.slice(0, 10).map((item) => {
    const row = reportByStudent.get(item.studentId)
    const slotScores = (row?.slotScores || {}) as Record<string, number | null>
    const sbtsRapor = avg([item.nfAvg, item.sbts])
    const satRapor = avg([item.nfAvg, item.sbts, item.sat])
    return {
      siswa: item.studentName,
      nf: item.nfValues.map((value) => Math.round(value)).join(','),
      rataNf: Number(item.nfAvg.toFixed(2)),
      sbts: item.sbts,
      sat: item.sat,
      raporSbtsSimulasi: Number(sbtsRapor.toFixed(2)),
      raporAkhirSimulasi: Number(satRapor.toFixed(2)),
      formatifScoreDb: row?.formatifScore ?? null,
      sbtsScoreDb: row?.sbtsScore ?? null,
      sasScoreDb: row?.sasScore ?? null,
      satSlotDb: slotScores?.SAT ?? null,
      finalScoreDb: row?.finalScore ?? null,
      predicateDb: row?.predicate ?? null,
    }
  })

  console.log('=== SIMULASI BERHASIL ===')
  console.log(
    JSON.stringify(
      {
        tahunAjaran: `${activeYear.name} (id=${activeYear.id})`,
        semester: SEMESTER,
        kelas: `${targetClass.name} (id=${targetClass.id})`,
        guruPengampuSimulasi: `${driverAssignment.teacher.name} (${driverAssignment.teacher.username})`,
        mapelSimulasi: `${simSubject.name} (${simSubject.code})`,
        totalSiswaDiproses: students.length,
        catatan: 'Data simulasi memakai prefix [SIMULASI NILAI] dan sourceKey simflow:*',
        preview10Siswa: preview,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error('SIMULASI GAGAL:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
