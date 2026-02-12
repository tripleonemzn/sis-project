/*
  Warnings:

  - You are about to drop the column `endDate` on the `academic_years` table. All the data in the column will be lost.
  - You are about to drop the column `semester` on the `academic_years` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `academic_years` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `academic_years` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nisn]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `semester1End` to the `academic_years` table without a default value. This is not possible if the table is not empty.
  - Added the required column `semester1Start` to the `academic_years` table without a default value. This is not possible if the table is not empty.
  - Added the required column `semester2End` to the `academic_years` table without a default value. This is not possible if the table is not empty.
  - Added the required column `semester2Start` to the `academic_years` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `academic_years` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('NONE', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('MONTHLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "AdditionalDuty" AS ENUM ('WAKASEK_KURIKULUM', 'WAKASEK_KESISWAAN', 'WAKASEK_SARPRAS', 'WAKASEK_HUMAS', 'KAPROG', 'WALI_KELAS', 'PEMBINA_OSIS', 'PEMBINA_EKSKUL', 'KEPALA_LAB', 'KEPALA_PERPUSTAKAAN', 'TIM_BOS', 'BENDAHARA');

-- CreateEnum
CREATE TYPE "ExamCategory" AS ENUM ('ACADEMIC', 'ADMISSION_STUDENT', 'ADMISSION_GENERAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'PRINCIPAL';
ALTER TYPE "Role" ADD VALUE 'STAFF';
ALTER TYPE "Role" ADD VALUE 'PARENT';
ALTER TYPE "Role" ADD VALUE 'CALON_SISWA';
ALTER TYPE "Role" ADD VALUE 'UMUM';

-- AlterTable
ALTER TABLE "academic_years" DROP COLUMN "endDate",
DROP COLUMN "semester",
DROP COLUMN "startDate",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "semester1End" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "semester1Start" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "semester2End" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "semester2Start" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "category" "ExamCategory" NOT NULL DEFAULT 'ACADEMIC';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "additionalDuties" "AdditionalDuty"[],
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "managedMajorId" INTEGER,
ADD COLUMN     "nisn" TEXT,
ADD COLUMN     "studentStatus" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verificationCode" TEXT,
ADD COLUMN     "verificationExpires" TIMESTAMP(3),
ADD COLUMN     "verificationMethod" "VerificationMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "payment_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "PaymentType" NOT NULL,

    CONSTRAINT "payment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "proofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ParentChildren" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ParentChildren_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ParentChildren_B_index" ON "_ParentChildren"("B");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_nisn_key" ON "users"("nisn");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managedMajorId_fkey" FOREIGN KEY ("managedMajorId") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "payment_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ParentChildren" ADD CONSTRAINT "_ParentChildren_A_fkey" FOREIGN KEY ("A") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ParentChildren" ADD CONSTRAINT "_ParentChildren_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
