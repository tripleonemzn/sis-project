-- AlterTable
ALTER TABLE "attendances"
  ADD COLUMN "teacherAssignmentId" INTEGER,
  ADD COLUMN "scheduleEntryId" INTEGER,
  ADD COLUMN "createdById" INTEGER,
  ADD COLUMN "updatedById" INTEGER,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "attendances_academicYearId_classId_subjectId_date_idx" ON "attendances"("academicYearId", "classId", "subjectId", "date");

-- CreateIndex
CREATE INDEX "attendances_academicYearId_teacherAssignmentId_date_idx" ON "attendances"("academicYearId", "teacherAssignmentId", "date");

-- CreateIndex
CREATE INDEX "attendances_academicYearId_scheduleEntryId_date_idx" ON "attendances"("academicYearId", "scheduleEntryId", "date");
