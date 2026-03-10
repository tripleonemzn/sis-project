import prisma from '../utils/prisma'

const SIM_SUBJECT_CODE = 'SIM_XIITKJ1_2026'
const SIM_PROGRAM_CODES = ['SIM_FMT_XIITKJ1', 'SIM_SBTS_XIITKJ1', 'SIM_SAT_XIITKJ1']
const SIM_COMPONENT_CODES = [
  'SIM_XIITKJ1_FORMATIF',
  'SIM_XIITKJ1_SBTS',
  'SIM_XIITKJ1_SAT',
]

async function main() {
  const subject = await prisma.subject.findUnique({
    where: { code: SIM_SUBJECT_CODE },
    select: { id: true, code: true, name: true },
  })

  const result: Record<string, number | string | null> = {
    subjectId: subject?.id ?? null,
    subjectCode: SIM_SUBJECT_CODE,
    subjectName: subject?.name ?? null,
  }

  result.deletedExamPrograms = (
    await prisma.examProgramConfig.deleteMany({
      where: { code: { in: SIM_PROGRAM_CODES } },
    })
  ).count

  result.deletedExamComponents = (
    await prisma.examGradeComponent.deleteMany({
      where: { code: { in: SIM_COMPONENT_CODES } },
    })
  ).count

  result.deletedScoreEntriesByPrefix = (
    await prisma.studentScoreEntry.deleteMany({
      where: { sourceKey: { startsWith: 'simflow:' } },
    })
  ).count

  if (!subject) {
    console.log(JSON.stringify({ ...result, note: 'Subject simulasi tidak ditemukan.' }, null, 2))
    return
  }

  const subjectId = subject.id

  result.deletedReportGrades = (
    await prisma.reportGrade.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedStudentGrades = (
    await prisma.studentGrade.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedScoreEntriesBySubject = (
    await prisma.studentScoreEntry.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedTeacherAssignments = (
    await prisma.teacherAssignment.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedAssignments = (
    await prisma.assignment.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedMaterials = (
    await prisma.material.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedAttendances = (
    await prisma.attendance.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedExamSchedules = (
    await prisma.examSchedule.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedExamPackets = (
    await prisma.examPacket.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedExams = (
    await prisma.exam.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedQuestionBanks = (
    await prisma.questionBank.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedSubjectKkms = (
    await prisma.subjectKKM.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedGradeComponents = (
    await prisma.gradeComponent.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedCpTpAnalyses = (
    await prisma.cpTpAnalysis.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedTeachingDevices = (
    await prisma.teachingDevice.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedUkkAssessments = (
    await prisma.ukkAssessment.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedUkkSchemes = (
    await prisma.ukkScheme.deleteMany({
      where: { subjectId },
    })
  ).count

  result.deletedSubject = (
    await prisma.subject.deleteMany({
      where: { id: subjectId },
    })
  ).count

  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error('CLEANUP GAGAL:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

