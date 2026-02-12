-- CreateEnum
CREATE TYPE "CurriculumType" AS ENUM ('MERDEKA', 'K13');

-- CreateEnum
CREATE TYPE "TeachingDeviceType" AS ENUM ('CP', 'TP', 'ATP', 'MODUL_AJAR', 'BAHAN_AJAR', 'ASESMEN', 'PROTA', 'PROMES', 'JURNAL');

-- CreateEnum
CREATE TYPE "TeachingPhase" AS ENUM ('E', 'F');

-- CreateTable
CREATE TABLE "teaching_devices" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "type" "TeachingDeviceType" NOT NULL,
    "phase" "TeachingPhase",
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_devices_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "teaching_devices" ADD CONSTRAINT "teaching_devices_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_devices" ADD CONSTRAINT "teaching_devices_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_devices" ADD CONSTRAINT "teaching_devices_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
